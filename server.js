const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const mime = require('mime-types');
const bodyParser = require('body-parser');
const config = require('./config.json');

const app = express();
const PORT = config.port;
const adminPath = config.adminPath;
const publicDir = path.join(__dirname, 'public');

app.use(bodyParser.urlencoded({ extended: false }));
app.set('view engine', 'ejs');
app.use(express.static(publicDir));

async function getDirectoryContents(dirPath) {
  const files = await fs.readdir(dirPath);
  const directories = [];
  const fileList = [];

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      directories.push(file);
    } else if (stat.isFile() && !isFileExcluded(file, config.excludedFiles)) {
        fileList.push(file);
    }
  }

  return { directories, fileList };
}

app.get('/', async (req, res) => {
  try {
    const { directories, fileList } = await getDirectoryContents(publicDir);
    res.render('index', { directories, fileList, adminPath });
  } catch (err) {
    res.status(500).send('Error when reading the folder');
  }
});

app.get('/folder/:folderName*', async (req, res) => {
  const folderName = req.params.folderName + (req.params[0] || '');
  const folderPath = path.join(publicDir, folderName);

  try {
    const { directories, fileList } = await getDirectoryContents(folderPath);
    res.render('folder', { folderName, directories, fileList, adminPath });
  } catch (err) {
    res.status(500).send('Error when reading the folder');
  }
});

async function handleFileRequest(req, res, filePath, folderName) {
  const mimeType = mime.lookup(filePath);
  const fileName = path.basename(filePath);
  
  if (isFileExcluded(fileName, config.excludedFiles) || !await fs.access(filePath).then(() => true).catch(() => false)) {
    return res.status(404).send('File not found');
  }

  if (mimeType === 'application/pdf') {
    res.render('pdf', { fileName, folderName, filePath: `/${path.relative(publicDir, filePath)}` });
  } else if (mimeType === 'text/plain') {
    res.render('txt', { fileName, folderName, filePath: `/${path.relative(publicDir, filePath)}` });
  } else {
    res.setHeader('Content-Type', mimeType);
    const data = await fs.readFile(filePath);
    res.send(data);
  }
}

app.get('/file/*', (req, res) => {
  const fullPath = req.params[0];
  const filePath = path.join(publicDir, fullPath);
  const folderName = path.dirname(fullPath);

  handleFileRequest(req, res, filePath, folderName);
});

app.get('/api/search', async (req, res) => {
  const query = req.query.query.toLowerCase();
  const searchType = req.query.searchType;
  const folder = req.query.folder || '';

  try {
    const resultFiles = await searchInDirectory(publicDir, query, searchType, folder);
    res.json({ files: resultFiles });
  } catch (err) {
    console.error('Error during research:', err);
    res.status(500).json({ error: 'Error during research' });
  }
});

async function searchInDirectory(dirPath, query, searchType, folder = '') {
  const resultFiles = [];
  const startPath = path.join(dirPath, folder);

  async function searchRecursive(currentPath) {
    const items = await fs.readdir(currentPath);

    for (const item of items) {
      const itemPath = path.join(currentPath, item);
      const stat = await fs.stat(itemPath);

      if (stat.isDirectory()) {
        await searchRecursive(itemPath);
      } else if (stat.isFile()) {
        const fileName = item.toLowerCase();
        const relativePath = path.relative(startPath, itemPath).replace(/\\/g, '/');

        if (isFileExcluded(fileName, config.excludedFiles)) return;

        if (searchType === 'filename' && fileName.includes(query)) {
          resultFiles.push(path.join(folder, relativePath));
        } else if (searchType === 'content' && path.extname(fileName) === '.txt') {
          try {
            const content = await fs.readFile(itemPath, 'utf-8');
            if (content.toLowerCase().includes(query)) {
              resultFiles.push(path.join(folder, relativePath));
            }
          } catch (error) {
            console.error(`Error when reading the file ${itemPath}:`, error);
          }
        }
      }
    }
  }

  await searchRecursive(startPath);
  return resultFiles;
}

function isFileExcluded(fileName, excludedFiles) {
  console.log(fileName)
  console.log(excludedFiles)
  return excludedFiles.some(excludedPattern => {
    if (excludedPattern.startsWith('*')) {
      const extension = excludedPattern.slice(1).toLowerCase();
      return fileName.endsWith(extension);
    }
    return fileName === excludedPattern.toLowerCase();
  });
}

module.exports = { isFileExcluded };

require('./adminRoutes')(app, adminPath);


app.listen(PORT, () => {
  console.log(`Server started on the port ${PORT}. Access to http://localhost:${PORT}`);
});


