const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const config = require('./config.json');
const adminPath = config.adminPath;

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
    (stat.isDirectory() ? directories : fileList).push(file);
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
  } catch (err) {
    res.status(500).send('Erreur lors de la lecture du dossier');
  }
}

async function handleFolderView(req, res) {
  try {
    const folderName = req.params.folderName + (req.params[0] || '');
    const folderPath = path.join(__dirname, 'public', folderName);
    const { directories, fileList } = await getDirectoryContents(folderPath);
    res.render('admin', { currentFolder: folderName, directories, fileList, config });
  } catch (err) {
    res.status(500).send('Erreur lors de la lecture du dossier');
  }
}

async function handleCreateFolder(req, res) {
  const { folderName, currentFolder = '' } = req.body;
  const folderPath = path.join(__dirname, 'public', currentFolder, folderName);
  await fs.mkdir(folderPath, { recursive: true });
  redirectToFolder(res, currentFolder);
}

async function handleDeleteFolder(req, res) {
  const { folderName, currentFolder = '' } = req.body;
  const folderPath = path.join(__dirname, 'public', currentFolder, folderName);
  await fs.rm(folderPath, { recursive: true, force: true });
  redirectToFolder(res, currentFolder);
}

async function handleRenameFolder(req, res) {
  const { oldFolderName, newFolderName, currentFolder = '' } = req.body;
  const oldPath = path.join(__dirname, 'public', currentFolder, oldFolderName);
  const newPath = path.join(__dirname, 'public', currentFolder, newFolderName);
  await fs.rename(oldPath, newPath);
  redirectToFolder(res, currentFolder);
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
    console.error('Erreur lors du renommage du fichier:', error);
    res.status(500).send('Erreur lors du renommage du fichier');
  }
}

async function handleDeleteFile(req, res) {
  const { fileName, currentFolder = '' } = req.body;
  const filePath = path.join(__dirname, 'public', currentFolder, fileName);
  await fs.unlink(filePath);
  redirectToFolder(res, currentFolder);
}

function handleFileUpload(req, res) {
  const currentFolder = req.body.currentFolder || '';
  if (!req.file) {
    return res.status(400).send('Erreur lors de l\'upload du fichier.');
  }
  console.log('Fichier uploadé avec succès :', req.file.originalname, 'dans le dossier', currentFolder);
  redirectToFolder(res, currentFolder);
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