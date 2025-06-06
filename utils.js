function isFileExcluded(fileName, excludedFiles) {
  return excludedFiles.some(excludedPattern => {
    if (excludedPattern.startsWith('*')) {
      const extension = excludedPattern.slice(1).toLowerCase();
      return fileName.endsWith(extension);
    }
    return fileName === excludedPattern.toLowerCase();
  });
}

module.exports = { isFileExcluded };