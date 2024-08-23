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
    } else if (stat.isFile()) {
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
    res.status(500).send('Erreur lors de la lecture du dossier');
  }
});

app.get('/folder/:folderName*', async (req, res) => {
  const folderName = req.params.folderName + (req.params[0] || '');
  const folderPath = path.join(publicDir, folderName);

  try {
    const { directories, fileList } = await getDirectoryContents(folderPath);
    res.render('folder', { folderName, directories, fileList });
  } catch (err) {
    res.status(500).send('Erreur lors de la lecture du dossier');
  }
});

async function handleFileRequest(req, res, filePath, folderName) {
  const mimeType = mime.lookup(filePath);
  const fileName = path.basename(filePath);

  if (!await fs.access(filePath).then(() => true).catch(() => false)) {
    return res.status(404).send('Fichier non trouvé');
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

app.get('/file/:folderName/:fileName', (req, res) => {
  const { folderName, fileName } = req.params;
  const filePath = path.join(publicDir, folderName, fileName);
  handleFileRequest(req, res, filePath, folderName);
});

app.get('/file/*', (req, res) => {
  const fullPath = req.params[0];
  const filePath = path.join(publicDir, fullPath);
  const folderName = path.dirname(fullPath);
  handleFileRequest(req, res, filePath, folderName);
});

app.get('/api/search', async (req, res) => {
  const query = req.query.query.toLowerCase(); // Convertir la recherche en minuscules pour l'insensibilité à la casse

  try {
    const { resultFiles } = await searchInDirectory(publicDir, query);

    // Renvoyer les résultats au format JSON
    res.json({
      files: resultFiles // Renvoyer uniquement les fichiers
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de la recherche' });
  }
});

async function searchInDirectory(dirPath, query) {
  const resultFiles = [];

  async function searchRecursive(currentPath) {
    const items = await fs.readdir(currentPath);

    for (const item of items) {
      const itemPath = path.join(currentPath, item);
      const stat = await fs.stat(itemPath);

      if (stat.isDirectory()) {
        await searchRecursive(itemPath); // Continue to search inside subdirectories
      } else if (stat.isFile()) {
        const fileName = item.toLowerCase();

        // Vérifie si le nom du fichier contient la chaîne de recherche
        if (fileName.includes(query)) {
          resultFiles.push(path.relative(publicDir, itemPath));
        }
      }
    }
  }

  await searchRecursive(dirPath);

  return { resultFiles };
}



require('./adminRoutes')(app, adminPath);

app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}. Accédez à http://localhost:${PORT}`);
});