const multer = require('multer');
const path = require('path');
const fs = require('fs');

const config = require('./config.json'); // Charger les informations de configuration
const adminPath = config.adminPath; // Utiliser l'URL d'administration depuis config.json

// Configuration de multer pour uploader les fichiers dans le bon dossier
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const currentFolder = req.body.currentFolder || ''; // Chemin du dossier actuel
    const uploadPath = path.join(__dirname, 'public', currentFolder);

    // Vérifier si le dossier existe, sinon le créer
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }

    cb(null, uploadPath); // Enregistrer dans le bon dossier
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname); // Utiliser le nom original du fichier
  }
});

// Middleware multer pour gérer les fichiers
const upload = multer({ storage: storage });

module.exports = function (app) {
  // Page d'administration pour afficher la racine ou un dossier spécifique
  app.get(`${adminPath}`, (req, res) => {
    const folderPath = path.join(__dirname, 'public');

    fs.readdir(folderPath, (err, files) => {
      if (err) {
        return res.status(500).send('Erreur lors de la lecture du dossier');
      }

      const directories = [];
      const fileList = [];

      files.forEach(file => {
        const filePath = path.join(folderPath, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
          directories.push(file);
        } else {
          fileList.push(file);
        }
      });

      res.render('admin', { currentFolder: '', directories, fileList, config }); // Passer config ici
    });
  });

  // Route pour naviguer dans un dossier spécifique
  app.get(`${adminPath}/folder/:folderName*`, (req, res) => {
    const folderName = req.params.folderName + (req.params[0] || '');
    const folderPath = path.join(__dirname, 'public', folderName);

    fs.readdir(folderPath, (err, files) => {
      if (err) {
        return res.status(500).send('Erreur lors de la lecture du dossier');
      }

      const directories = [];
      const fileList = [];

      files.forEach(file => {
        const filePath = path.join(folderPath, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
          directories.push(file);
        } else {
          fileList.push(file);
        }
      });

      res.render('admin', { currentFolder: folderName, directories, fileList, config }); // Passer config ici
    });
  });

  // Route pour créer un dossier
  app.post(`${adminPath}/create-folder`, (req, res) => {
    const folderName = req.body.folderName; // Nom du nouveau dossier à créer
    let currentFolder = req.body.currentFolder || ''; // Chemin complet du sous-dossier où créer le nouveau dossier

    const folderPath = path.join(__dirname, 'public', currentFolder, folderName);

    // Vérifier si le dossier n'existe pas déjà, sinon le créer
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath);
    }

    // Rediriger vers le bon dossier après création
    if (currentFolder) {
      res.redirect(`${adminPath}/folder/${currentFolder}`);
    } else {
      res.redirect(`${adminPath}`);
    }
  });

  // Supprimer un dossier
  app.post(`${adminPath}/delete-folder`, (req, res) => {
    const folderName = req.body.folderName;
    const currentFolder = req.body.currentFolder || '';
    const folderPath = path.join(__dirname, 'public', currentFolder, folderName);

    if (fs.existsSync(folderPath)) {
      fs.rmdirSync(folderPath, { recursive: true });
    }

    if (currentFolder) {
      res.redirect(`${adminPath}/folder/${currentFolder}`);
    } else {
      res.redirect(`${adminPath}`);
    }
  });

  // Renommer un dossier
  app.post(`${adminPath}/rename-folder`, (req, res) => {
    const oldFolderName = req.body.oldFolderName;
    const newFolderName = req.body.newFolderName;
    const currentFolder = req.body.currentFolder || '';
    const oldFolderPath = path.join(__dirname, 'public', currentFolder, oldFolderName);
    const newFolderPath = path.join(__dirname, 'public', currentFolder, newFolderName);

    if (fs.existsSync(oldFolderPath) && !fs.existsSync(newFolderPath)) {
      fs.renameSync(oldFolderPath, newFolderPath);
    }

    if (currentFolder) {
      res.redirect(`${adminPath}/folder/${currentFolder}`);
    } else {
      res.redirect(`${adminPath}`);
    }
  });

  // Renommer un fichier
  app.post(`${adminPath}/rename-file`, (req, res) => {
    const oldFileName = req.body.oldFileName;
    const newFileName = req.body.newFileName;
    const currentFolder = req.body.currentFolder || '';
    const oldFilePath = path.join(__dirname, 'public', currentFolder, oldFileName);
    const newFilePath = path.join(__dirname, 'public', currentFolder, newFileName);

    if (fs.existsSync(oldFilePath) && !fs.existsSync(newFilePath)) {
      fs.renameSync(oldFilePath, newFilePath);
    }

    if (currentFolder) {
      res.redirect(`${adminPath}/folder/${currentFolder}`);
    } else {
      res.redirect(`${adminPath}`);
    }
  });

  // Supprimer un fichier
  app.post(`${adminPath}/delete-file`, (req, res) => {
    const fileName = req.body.fileName;
    const currentFolder = req.body.currentFolder || '';
    const filePath = path.join(__dirname, 'public', currentFolder, fileName);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    if (currentFolder) {
      res.redirect(`${adminPath}/folder/${currentFolder}`);
    } else {
      res.redirect(`${adminPath}`);
    }
  });

  // Route pour uploader un fichier dans un dossier spécifique
  app.post(`${adminPath}/upload-file`, upload.single('fileUpload'), (req, res) => {
    const currentFolder = req.body.currentFolder || ''; // Chemin du dossier actuel

    // Vérification si le fichier a été uploadé
    if (!req.file) {
      return res.status(400).send('Erreur lors de l\'upload du fichier.');
    }

    console.log('Fichier uploadé avec succès :', req.file.originalname, 'dans le dossier', currentFolder);

    // Rediriger vers le dossier où l'upload a été fait
    if (currentFolder) {
      res.redirect(`${adminPath}/folder/${currentFolder}`);
    } else {
      res.redirect(`${adminPath}`);
    }
  });
};
