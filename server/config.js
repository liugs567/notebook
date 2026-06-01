/** @type {import('./types.js').BlogConfig} */
export default {
  blogRootDir: './blog_storage',
  savedDirName: 'saved',
  tempDraftDirName: 'temp_drafts',
  indexFileName: 'blog-index.json',
  autoCreateDir: true,
  port: 3001,
  importMaxFiles: 20,
  importMaxMdSize: 2 * 1024 * 1024,
  importMaxTotalSize: 50 * 1024 * 1024,
  importMaxImageSize: 5 * 1024 * 1024,
  importMaxDepth: 10,
  importImageExts: ['.png', '.jpg', '.jpeg', '.webp', '.gif'],
  importMainMdNames: ['index.md', 'README.md'],
}
