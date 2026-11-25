import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, normalizePath } from 'vite';

const artFolder = 'docs/art/chapter-1';
const app = fileURLToPath(new URL('.', import.meta.url));
const repository = resolve(app, '..');
const dist = join(app, 'dist');

// The gallery has its own entry so opening the game never downloads the art viewer.
function galleryFiles() {
  return {
    name: 'chapter-art-files',
    configureServer(server) {
      // Keep the published gallery URL in development. Vite serves the same
      // shared sheets and sources that are packaged by writeBundle.
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (url.pathname === '/' + artFolder) {
          res.writeHead(302, { Location: url.pathname + '/' + url.search });
          return res.end();
        }
        if (url.pathname === '/' + artFolder + '/viewer.js') {
          req.url = '/gallery/viewer.js' + url.search;
        } else if (
          url.pathname.startsWith('/' + artFolder + '/') ||
          url.pathname.startsWith('/asset-sources/')
        ) {
          const path = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
          req.url = '/@fs/' + normalizePath(join(repository, path)) + url.search;
        }
        next();
      });
    },
    async writeBundle() {
      const files = (await readdir(join(repository, artFolder))).map((name) =>
        join(artFolder, name),
      );
      files.push(
        'asset-sources/Art/ThirdParty/KayKit/SOURCES.md',
        'asset-sources/Assets/_Oblivion/Art/PolyHaven/SOURCES.md',
        'asset-sources/Art/Chapter1/material-study.webp',
      );
      for (const file of files) {
        const dest = join(dist, file);
        await mkdir(dirname(dest), { recursive: true });
        await copyFile(join(repository, file), dest);
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  if (mode === 'gallery') {
    return {
      base: './',
      publicDir: false,
      plugins: [galleryFiles()],
      build: {
        target: 'es2022',
        outDir: join(dist, artFolder),
        rolldownOptions: {
          input: join(app, 'gallery/viewer.js'),
          output: { entryFileNames: 'viewer.js' },
        },
      },
    };
  }
  return {
    base: './',
    publicDir: join(repository, 'public'),
    plugins: [{ ...galleryFiles(), apply: 'serve' }],
    build: { target: 'es2022', chunkSizeWarningLimit: 1600 },
    server: {
      port: 5186,
      strictPort: true,
      fs: {
        allow: [
          app,
          join(repository, 'shared'),
          join(repository, 'asset-sources'),
          join(repository, 'docs/art'),
          join(repository, 'docs/provenance'),
        ],
      },
    },
    preview: { port: 4186, strictPort: true },
  };
});
