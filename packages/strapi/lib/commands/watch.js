const chokidar = require('chokidar');
const fs = require('fs-extra');
const path = require('path');
const strapiAdmin = require('strapi-admin');

module.exports = async function() {
  const getPkgPath = name =>
    path.dirname(require.resolve(`${name}/package.json`));

  const dir = process.cwd();
  const pkgJSON = require(path.join(dir, 'package.json'));

  const admin = path.join(dir, 'admin');
  const appPlugins = Object.keys(pkgJSON.dependencies).filter(
    dep =>
      dep.startsWith('strapi-plugin') &&
      fs.existsSync(path.resolve(getPkgPath(dep), 'admin', 'src', 'index.js'))
  );
  const pluginsToWatch = appPlugins.map(plugin =>
    path.join(
      dir,
      'extensions',
      plugin.replace(/^strapi-plugin-/i, ''),
      'admin'
    )
  );

  function watchFiles() {
    const watcher = chokidar.watch([admin, ...pluginsToWatch], {
      ignoreInitial: true,
      ignorePermissionErrors: true,
    });

    watcher.on('all', async (event, filePath) => {
      const isExtension = filePath.includes('/extensions/');
      const pluginName = isExtension
        ? filePath.split('/extensions/')[1].split('/admin')[0]
        : '';
      const packageName = isExtension
        ? `strapi-plugin-${pluginName}`
        : 'strapi-admin';
      const targetPath = isExtension
        ? filePath.split('/extensions/')[1].replace(pluginName, '')
        : filePath.split('/admin')[1];

      const destFolder = isExtension
        ? path.join(dir, '.cache', 'plugins', packageName, 'admin')
        : path.join(dir, '.cache', 'admin');

      const packagePath = require
        .resolve(path.join(packageName, 'package.json'))
        .replace('/package.json', '');

      if (event === 'unlink' || event === 'unlinkDir') {
        const originalFilePathInNodeModules = path.join(
          packagePath,
          'admin',
          targetPath
        );

        // Remove the file or folder
        try {
          fs.removeSync(path.join(destFolder, targetPath));
        } catch (err) {
          console.log('An error occured while deleting the file', err);
        }

        // Check if the file or folder exists in node_modules
        // If so copy the old one
        // TODO recreate plugins.js file
        if (fs.pathExistsSync(path.resolve(originalFilePathInNodeModules))) {
          try {
            await fs.copy(
              path.resolve(originalFilePathInNodeModules),
              path.join(destFolder, targetPath)
            );

            const shouldCopyPluginsJSFile =
              filePath.split('/admin/src').filter(p => !!p).length === 1;

            if (
              (event === 'unlinkDir' &&
                !isExtension &&
                shouldCopyPluginsJSFile) ||
              (!isExtension && filePath.includes('plugins.js'))
            ) {
              await strapiAdmin.createPluginsJs(
                appPlugins,
                path.join(dir, '.cache')
              );
            }
          } catch (err) {
            console.log(
              'An error occured while copying the original file',
              err
            );
          }
        }
      } else {
        try {
          await fs.copy(filePath, path.join(destFolder, targetPath));
        } catch (err) {
          console.log(err);
        }
      }
    });
  }

  watchFiles();
  strapiAdmin.watch(dir);
};
