/**
 * @typedef {Object} BlogConfig
 * @property {string} blogRootDir
 * @property {string} savedDirName
 * @property {string} tempDraftDirName
 * @property {string} indexFileName
 * @property {boolean} autoCreateDir
 * @property {number} port
 * @property {number} importMaxFiles
 * @property {number} importMaxMdSize
 * @property {number} importMaxTotalSize
 * @property {number} importMaxImageSize
 * @property {number} importMaxDepth
 * @property {string[]} importImageExts
 * @property {string[]} importMainMdNames
 */

/**
 * @typedef {Object} BlogIndexArticle
 * @property {string} id
 * @property {string} title
 * @property {string} folderName
 * @property {'saved' | 'temp'} source
 * @property {'published'} [status]
 * @property {string} path
 * @property {number} createTime
 * @property {number} updateTime
 * @property {string[]} [tags]
 * @property {string} [excerpt]
 */

/**
 * @typedef {Object} BlogIndex
 * @property {number} version
 * @property {number} updatedAt
 * @property {BlogIndexArticle[]} articles
 * @property {string[]} [tags]
 */

/**
 * @typedef {Object} ArticleMeta
 * @property {string} id
 * @property {string} title
 * @property {'published'} [status]
 * @property {string} folderName
 * @property {number} createTime
 * @property {number} updateTime
 * @property {string[]} [tags]
 */

export {}
