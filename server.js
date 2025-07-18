const rateLimit = require('@fastify/rate-limit');
const fastify = require('fastify')({ logger: true });
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const config = require('./config.json');
const { isFileExcluded } = require('./utils');
const util = require('util');
const stream = require('stream');
const pipeline = util.promisify(stream.pipeline);
const { setTimeout } = require('timers/promises');

// Register rate limiter
fastify.register(rateLimit, {
  max: 100, // Limit each IP to 100 requests per 15 minutes
  timeWindow: '15 minutes'
});

// Static files
fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, 'public'),
  prefix: '/',
});

// Pour parser les formulaires HTML
fastify.register(require('@fastify/formbody'));

// EJS views
fastify.register(require('@fastify/view'), {
  engine: { ejs: require('ejs') },
  root: path.join(__dirname, 'views'),
  layout: false
});

// Multipart support
fastify.register(require('@fastify/multipart'), {
  limits: {
    fileSize: 100 * 1024 * 1024 // 100 Mo
  }
});

// Helper
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

// Home
fastify.get('/', async (req, reply) => {
  try {
    const { directories, fileList } = await getDirectoryContents(path.join(__dirname, 'public'));
    return reply.view('index.ejs', { directories, fileList, adminPath: config.adminPath });
  } catch (err) {
    reply.code(500).send('Error when reading the folder');
  }
});

// Folder view
fastify.get('/folder/*', async (req, reply) => {
  const folderName = req.params['*'] || '';
  const folderPath = path.join(__dirname, 'public', folderName);

  try {
    const { directories, fileList } = await getDirectoryContents(folderPath);
    return reply.view('folder.ejs', { folderName, directories, fileList, adminPath: config.adminPath });
  } catch (err) {
    reply.code(500).send('Error when reading the folder');
  }
});

// File view (PDF, TXT, other)
fastify.get('/file/*', async (req, reply) => {
  const fullPath = req.params['*'];
  const filePath = path.join(__dirname, 'public', fullPath);
  const folderName = path.dirname(fullPath);
  const mime = require('mime-types');
  const mimeType = mime.lookup(filePath);
  const fileName = path.basename(filePath);

  try {
    if (isFileExcluded(fileName, config.excludedFiles) || !await fs.access(filePath).then(() => true).catch(() => false)) {
      return reply.code(404).send('File not found');
    }

    if (mimeType === 'application/pdf') {
      return reply.view('pdf.ejs', { fileName, folderName, filePath: `/${path.relative(path.join(__dirname, 'public'), filePath)}` });
    } else if (mimeType === 'text/plain') {
      return reply.view('txt.ejs', { fileName, folderName, filePath: `/${path.relative(path.join(__dirname, 'public'), filePath)}` });
    } else {
      const data = await fs.readFile(filePath);
      reply.header('Content-Type', mimeType);
      return reply.send(data);
    }
  } catch (err) {
    return reply.code(500).send('Error when reading the file');
  }
});

// API search
fastify.get('/api/search', async (req, reply) => {
  const query = (req.query.query || '').toLowerCase();
  const searchType = req.query.searchType;
  const folder = req.query.folder || '';
  try {
    const resultFiles = await searchInDirectory(path.join(__dirname, 'public'), query, searchType, folder);
    return reply.send({ files: resultFiles });
  } catch (err) {
    reply.code(500).send({ error: 'Error during research' });
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

        if (isFileExcluded(fileName, config.excludedFiles)) continue;

        if (searchType === 'filename' && fileName.includes(query)) {
          resultFiles.push(path.join(folder, relativePath));
        } else if (searchType === 'content' && path.extname(fileName) === '.txt') {
          try {
            const content = await fs.readFile(itemPath, 'utf-8');
            if (content.toLowerCase().includes(query)) {
              resultFiles.push(path.join(folder, relativePath));
            }
          } catch (error) {
            // ignore
          }
        }
      }
    }
  }

  await searchRecursive(startPath);
  return resultFiles;
}

// Route admin (accueil)
fastify.get(config.adminPath, async (req, reply) => {
  try {
    const { directories, fileList } = await getDirectoryContents(path.join(__dirname, 'public'));
    return reply.view('admin.ejs', {
      folderName: '', // <-- Ajoute cette ligne !
      directories,
      fileList,
      config
    });
  } catch (err) {
    reply.code(500).send('Error when reading the folder');
  }
});

// Route admin sous-dossier
fastify.get(`${config.adminPath}/folder/*`, async (req, reply) => {
  const folderName = req.params['*'] || '';
  const folderPath = path.join(__dirname, 'public', folderName);

  try {
    const { directories, fileList } = await getDirectoryContents(folderPath);
    return reply.view('admin.ejs', {
      folderName,
      currentFolder: folderName,
      directories,
      fileList,
      config
    });
  } catch (err) {
    reply.code(500).send('Error when reading the folder');
  }
});

// Créer un dossier
fastify.post(`${config.adminPath}/create-folder`, async (req, reply) => {
  let { folderName, currentFolder = '' } = req.body;
  if (Array.isArray(folderName)) folderName = folderName[0];
  if (Array.isArray(currentFolder)) currentFolder = currentFolder[0];

  const safeFolder = path.normalize(currentFolder).replace(/^(\.\.(\/|\\|$))+/, '');
  const safeNewFolder = path.basename(folderName);

  if (!safeNewFolder) {
    return reply.code(400).send('Nom de dossier invalide');
  }

  const folderPath = path.join(__dirname, 'public', safeFolder, safeNewFolder);

  try {
    await fs.mkdir(folderPath, { recursive: true });
    const encodedPath = safeFolder.split('/').map(encodeURIComponent).join('/');
    reply.redirect(`${config.adminPath}/folder/${encodedPath}`);
  } catch (err) {
    reply.code(500).send('Error when creating the folder');
  }
});

// Supprimer un dossier
fastify.post(`${config.adminPath}/delete-folder`, async (req, reply) => {
  let { folderName = '', currentFolder = '' } = req.body;
  if (Array.isArray(folderName)) folderName = folderName[0];
  if (Array.isArray(currentFolder)) currentFolder = currentFolder[0];

  const safeFolder = path.normalize(currentFolder).replace(/^(\.\.(\/|\\|$))+/, '');
  const safeDeleteFolder = path.basename(folderName);

  // Sécurité : Interdire suppression de la racine ou d'un chemin vide
  if (!safeDeleteFolder) {
    return reply.code(400).send('Suppression du dossier racine interdite !');
  }

  const folderPath = path.join(__dirname, 'public', safeFolder, safeDeleteFolder);

  try {
    await fs.rm(folderPath, { recursive: true, force: true });
    // Redirige vers le dossier parent
    const encodedPath = safeFolder.split('/').map(encodeURIComponent).join('/');
    reply.redirect(`${config.adminPath}/folder/${encodedPath}`);
  } catch (err) {
    reply.code(500).send('Error when deleting the folder');
  }
});

// Renommer un dossier
fastify.post(`${config.adminPath}/rename-folder`, async (req, reply) => {
  const { oldFolderName, newFolderName, currentFolder = '' } = req.body;
  const safeFolder = path.normalize(currentFolder).replace(/^(\.\.(\/|\\|$))+/, '');
  const safeOld = path.basename(oldFolderName);
  const safeNew = path.basename(newFolderName);
  const oldPath = path.join(__dirname, 'public', safeFolder, safeOld);
  const newPath = path.join(__dirname, 'public', safeFolder, safeNew);

  try {
    await fs.rename(oldPath, newPath);
    const encodedPath = safeFolder.split('/').map(encodeURIComponent).join('/');
    reply.redirect(`${config.adminPath}/folder/${encodedPath}`);
  } catch (err) {
    reply.code(500).send('Error when renaming the folder');
  }
});

// Renommer un fichier (garde l'extension si absente)
fastify.post(`${config.adminPath}/rename-file`, async (req, reply) => {
  const { oldFileName, newFileName, currentFolder = '' } = req.body;
  const safeFolder = path.normalize(currentFolder).replace(/^(\.\.(\/|\\|$))+/, '');
  const safeOld = path.basename(oldFileName);
  let safeNew = path.basename(newFileName);

  // Ajoute l'extension d'origine si absente
  const oldExt = path.extname(safeOld);
  if (!path.extname(safeNew)) {
    safeNew += oldExt;
  }

  const oldPath = path.join(__dirname, 'public', safeFolder, safeOld);
  const newPath = path.join(__dirname, 'public', safeFolder, safeNew);

  try {
    await fs.rename(oldPath, newPath);
    const encodedPath = safeFolder.split('/').map(encodeURIComponent).join('/');
    reply.redirect(`${config.adminPath}/folder/${encodedPath}`);
  } catch (err) {
    reply.code(500).send('Error when renaming the file');
  }
});

// Supprimer un fichier
fastify.post(`${config.adminPath}/delete-file`, async (req, reply) => {
  const { fileName, currentFolder = '' } = req.body;
  const safeFolder = path.normalize(currentFolder).replace(/^(\.\.(\/|\\|$))+/, '');
  const safeFile = path.basename(fileName);
  const filePath = path.join(__dirname, 'public', safeFolder, safeFile);

  try {
    await fs.unlink(filePath);
    const encodedPath = safeFolder.split('/').map(encodeURIComponent).join('/');
    reply.redirect(`${config.adminPath}/folder/${encodedPath}`);
  } catch (err) {
    reply.code(500).send('Error when deleting the file');
  }
});

// Upload de fichier (déjà présent, mais sécurisé)
fastify.post(`${config.adminPath}/upload-file`, { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
  fastify.log.info('Début upload');
  const parts = req.parts();
  let currentFolder = '';
  let fileUploaded = false;

  for await (const part of parts) {
    fastify.log.info(`Part: ${part.type} - ${part.fieldname}`);
    if (part.type === 'file' && part.fieldname === 'fileUpload') {
      // Traite le fichier immédiatement
      let safeFolder = path.normalize(currentFolder).replace(/^(\.\.(\/|\\|$))+/, '');
      let safeFilename = path.basename(part.filename);
      let uploadPath = path.join(__dirname, 'public', safeFolder, safeFilename);
      fastify.log.info(`Avant pipeline : ${uploadPath}`);
      try {
        await Promise.race([
          pipeline(part.file, fsSync.createWriteStream(uploadPath)),
          setTimeout(10000).then(() => { throw new Error('Timeout pipeline'); })
        ]);
        fastify.log.info(`Fichier uploadé : ${uploadPath}`);
        fileUploaded = true;
      } catch (err) {
        fastify.log.error(`Erreur upload : ${err.message}`);
        return reply.code(500).send('Erreur lors de l\'upload du fichier');
      }
    } else if (part.type === 'field' && part.fieldname === 'currentFolder') {
      currentFolder = part.value || '';
    }
  }

  if (!fileUploaded) {
    fastify.log.error('No file uploaded');
    return reply.code(400).send('No file uploaded');
  }

  const safeFolder = path.normalize(currentFolder).replace(/^(\.\.(\/|\\|$))+/, '');
  const encodedPath = safeFolder.split('/').map(encodeURIComponent).join('/');
  reply.redirect(`${config.adminPath}/folder/${encodedPath}`);
});

// Lancement du serveur
fastify.listen({ port: config.port, host: '0.0.0.0' }, err => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  console.log(`Server started on http://localhost:${config.port}`);
});
