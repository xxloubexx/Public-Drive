const express = require('express');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const bodyParser = require('body-parser');
const config = require('./config.json'); // Charger les informations de configuration

const app = express();
const PORT = config.port;
const adminPath = config.adminPath; // Utiliser l'URL d'administration depuis config.json

// Pour traiter les données de formulaire POST
app.use(bodyParser.urlencoded({ extended: false }));

// Définir le moteur de templates EJS
app.set('view engine', 'ejs');

// Définir le dossier public pour les fichiers statiques
app.use(express.static(path.join(__dirname, 'public')));

// Définir le dossier public qui contient vos fichiers
const publicDir = path.join(__dirname, 'public');

// Page d'accueil - Liste les dossiers et fichiers à la racine
app.get('/', (req, res) => {
  fs.readdir(publicDir, (err, files) => {
    if (err) {
      return res.status(500).send('Erreur lors de la lecture du dossier');
    }

    const directories = [];
    const fileList = [];

    files.forEach(file => {
      const filePath = path.join(publicDir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        directories.push(file);
      } else {
        fileList.push(file);
      }
    });

    res.render('index', { directories, fileList, adminPath }); // Ajoutez adminPath ici
  });
});

// Route pour afficher le contenu d'un sous-dossier
app.get('/folder/:folderName*', (req, res) => {
    const folderName = req.params.folderName + (req.params[0] || '');
    const folderPath = path.join(publicDir, folderName);
  
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
        } else if (stat.isFile()) {
          fileList.push(file);
        }
      });
  
      res.render('folder', { folderName, directories, fileList });
    });
  });


// Route pour lire un fichier
app.get('/file/:folderName/:fileName', (req, res) => {
    const folderName = req.params.folderName;
    const fileName = req.params.fileName;
    const filePath = path.join(publicDir, folderName, fileName);
  
    const mimeType = mime.lookup(filePath);
  
    if (mimeType === 'application/pdf') {
      // Si c'est un fichier PDF, on l'affiche dans un iframe avec un template EJS
      res.render('pdf', { fileName, folderName, filePath: `/${folderName}/${fileName}` });
    } else if (mimeType === 'text/plain') {
      // Si c'est un fichier .txt, on l'affiche aussi dans un iframe pour respecter les espaces
      res.render('txt', { fileName, folderName, filePath: `/${folderName}/${fileName}` });
    } else {
      // Pour les autres types de fichiers, on les affiche normalement
      res.setHeader('Content-Type', mimeType);
      fs.readFile(filePath, (err, data) => {
        if (err) {
          return res.status(404).send('Fichier non trouvé');
        }
  
        res.send(data);
      });
    }
  });
  
// Route pour lire un fichier dans un sous-dossier
app.get('/file/*', (req, res) => {
    const fullPath = req.params[0]; // Récupérer le chemin complet après '/file/'
    const filePath = path.join(publicDir, fullPath); // Créer le chemin complet vers le fichier
    const folderName = path.dirname(fullPath); // Récupérer le nom du dossier
  
    const mimeType = mime.lookup(filePath); // Déterminer le type MIME du fichier
  
    if (!fs.existsSync(filePath)) {
      return res.status(404).send('Fichier non trouvé');
    }
  
    if (mimeType === 'application/pdf') {
      // Si c'est un fichier PDF, on l'affiche dans un iframe avec un template EJS
      res.render('pdf', { fileName: path.basename(filePath), filePath: `/${fullPath}`, folderName });
    } else if (mimeType === 'text/plain') {
      // Si c'est un fichier .txt, on l'affiche dans un iframe pour respecter les espaces
      res.render('txt', { fileName: path.basename(filePath), filePath: `/${fullPath}`, folderName });
    } else {
      // Pour les autres types de fichiers, on les affiche normalement
      res.setHeader('Content-Type', mimeType);
      fs.readFile(filePath, (err, data) => {
        if (err) {
          return res.status(500).send('Erreur lors de la lecture du fichier');
        }
  
        res.send(data);
      });
    }
  });
  
  
  
// Importation des routes d'administration
require('./adminRoutes')(app, adminPath);

// Lancement du serveur
app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}. Accédez à http://localhost:${PORT}`);
});
