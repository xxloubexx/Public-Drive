const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const config = require('./config.json');
const adminPath = config.adminPath;

const { isFileExcluded } = require('./server');

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const currentFolder = req.body.currentFolder || '';
    const uploadPath = path.join(__dirname, 'public', currentFolder);
    await fs.mkdir(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => cb(null, file.originalname)
});

const upload = multer({ storage: storage });

async function getDirectoryContents(folderPath) {
  const files = await fs.readdir(folderPath);
  const directories = [];
  const fileList = [];

  for (const file of files) {
    const filePath = path.join(folderPath, file);
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      directories.push(file);
    } else if (stat.isFile() && !isFileExcluded(file, config.excludedFiles)) {
      fileList.push(file);
    }
  }

  return { directories, fileList };
}

function redirectToFolder(res, currentFolder) {
  res.redirect(currentFolder ? `${adminPath}/folder/${currentFolder}` : adminPath);
}

async function handleAdminRoot(req, res) {
  try {
    const folderPath = path.join(__dirname, 'public');
    const { directories, fileList } = await getDirectoryContents(folderPath);
    res.render('admin', { currentFolder: '', directories, fileList, config });
  } catch (error) {
    console.error('handleAdminRoot ERROR:', error);
    res.status(500).send('Error when reading the folder');
  }
}

async function handleFolderView(req, res) {
  try {
    const folderName = req.params.folderName + (req.params[0] || '');
    const folderPath = path.join(__dirname, 'public', folderName);
    const { directories, fileList } = await getDirectoryContents(folderPath);
    res.render('admin', { currentFolder: folderName, directories, fileList, config });
  } catch (error) {
    console.error('handleFolderView ERROR:', error);
    res.status(500).send('Error when reading the folder');
  }
}

async function handleCreateFolder(req, res) {
  try {
    const { folderName, currentFolder = '' } = req.body;
    const folderPath = path.join(__dirname, 'public', currentFolder, folderName);
    await fs.mkdir(folderPath, { recursive: true });
    redirectToFolder(res, currentFolder);
  } catch (error) {
    console.error('handleCreateFolder ERROR:', error);
    res.status(500).send('Error when creating the folder');
  }
}

async function handleDeleteFolder(req, res) {
  try {
    const { folderName, currentFolder = '' } = req.body;
    const folderPath = path.join(__dirname, 'public', currentFolder, folderName);
    await fs.rm(folderPath, { recursive: true, force: true });
    redirectToFolder(res, currentFolder);
  } catch (error) {
    console.error('handleDeleteFolder ERROR:', error);
    res.status(500).send('Error when renaming the folder');
  }
}

async function handleRenameFolder(req, res) {
  try {
    const { oldFolderName, newFolderName, currentFolder = '' } = req.body;
    const oldPath = path.join(__dirname, 'public', currentFolder, oldFolderName);
    const newPath = path.join(__dirname, 'public', currentFolder, newFolderName);
    await fs.rename(oldPath, newPath);
    redirectToFolder(res, currentFolder);
  } catch (error) {
    console.error('handleRenameFolder ERROR:', error);
    res.status(500).send('Error when deleting the folder');
  }
}

async function handleRenameFile(req, res) {
  try {
    const { oldFileName, newFileName, currentFolder = '' } = req.body;
    const oldPath = path.join(__dirname, 'public', currentFolder, oldFileName);
    const oldExtension = path.extname(oldFileName);
    let finalNewFileName = newFileName;
    if (path.extname(newFileName) === '') {
      finalNewFileName += oldExtension;
    }
    const newPath = path.join(__dirname, 'public', currentFolder, finalNewFileName);
    await fs.rename(oldPath, newPath);
    console.log(`Fichier renommé de "${oldFileName}" à "${finalNewFileName}"`);
    redirectToFolder(res, currentFolder);
  } catch (error) {
    console.error('handleRenameFile ERROR:', error);
    res.status(500).send('Error when renaming the file');
  }
}

async function handleDeleteFile(req, res) {
  try {
    const { fileName, currentFolder = '' } = req.body;
    const filePath = path.join(__dirname, 'public', currentFolder, fileName);
    await fs.unlink(filePath);
    redirectToFolder(res, currentFolder);
  } catch (error) {
    console.error(`handleDeleteFile ERROR: ${error}`)
    res.status(500).send('Error when deleting file');
  }
}

function handleFileUpload(req, res) {
  try {
    const currentFolder = req.body.currentFolder || '';
    if (!req.file) {
      return res.status(400).send('Error during the upload of the file.');
    }
    console.log('Successfully uploaded file :', req.file.originalname, 'in the folder', currentFolder);
    redirectToFolder(res, currentFolder);
  } catch (error) {
    console.error(`handleFileUpload ERROR: ${error}`)
    res.status(500).send('Error when uploading file');
  }
}

module.exports = function (app) {
  app.get(`${adminPath}`, handleAdminRoot);
  app.get(`${adminPath}/folder/:folderName*`, handleFolderView);
  app.post(`${adminPath}/create-folder`, handleCreateFolder);
  app.post(`${adminPath}/delete-folder`, handleDeleteFolder);
  app.post(`${adminPath}/rename-folder`, handleRenameFolder);
  app.post(`${adminPath}/rename-file`, handleRenameFile);
  app.post(`${adminPath}/delete-file`, handleDeleteFile);
  app.post(`${adminPath}/upload-file`, upload.single('fileUpload'), handleFileUpload);
};