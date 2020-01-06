/**
 * page.js
 *
 * Licensed under the MIT License
 *
 * Copyright(c) 2018 Google Inc.
 */

 /**
  * Base class for Pages.  Every Page has an aspect ratio method.
  * TODO(epub): Page should have a render() method that takes in a Canvas element.
  */
export class Page {
  constructor(pageName) {
    /** @type {string} */
    this.pageName = pageName;
  }

  /** @return {Number} The width-height aspect ratio. */
  getAspectRatio() { return 6.625 / 10.25; }
}

/**
 * A page that holds a single image element.
 */
export class ImagePage extends Page {
  /**
   * @param {string} name
   * @param {Image} img The Image object created.
   */
  constructor(name, img) {
    super(name);
    this.img = img;
  }

  getAspectRatio() { return this.img.naturalWidth / this.img.naturalHeight; }
}

/**
 * A page that holds raw text.
 */
export class TextPage extends Page {
  /**
   * @param {string} name
   * @param {string} text The raw text in the page.
   */
  constructor(name, text) {
    super(name);
    this.rawText = text;
  }
}

// TODO(epub): Do not just escape the raw HTML, that would be bad.
export class HtmlPage extends TextPage {
  /**
   * @param {string} name
   * @param {string} rawHtml The raw html in the page.
   */
  constructor(name, rawHtml) {
    super(name, rawHtml);
    this.escapedHtml = escape(rawHtml);
  }
}

/**
 * A page that holds an iframe with sanitized XHTML.
 */
export class XhtmlPage extends Page {
  /**
   * @param {string} name
   * @param {HTMLIframeElement} iframeEl
   * @param {Function(HTMLIframeElement)} scrubberFn Function to be called after the iframe has been
   *     added back into the DOM.
   */
  constructor(name, iframeEl, scrubberFn) {
    super(name);
    /** @type {HTMLIframeElement} */
    this.iframeEl = iframeEl;
    /** @type {Function} */
    this.scrubberFn = scrubberFn;
  }

  scrub() {
    return this.scrubberFn(this.pageEl);
  }
}

/**
 * @param {ArrayBuffer} ab
 * @param {string} mimeType
 */
function createURLFromArray(ab, mimeType) {
  if (mimeType === 'image/xml+svg') {
    const xmlStr = new TextDecoder('utf-8').decode(ab);
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(xmlStr);
  }
  const offset = ab.byteOffset;
  const len = ab.byteLength;
  let blob = new Blob([ab], {type: mimeType}).slice(offset, offset + len, mimeType);
  return URL.createObjectURL(blob);
};

/**
 * @param {string} filename
 * @return {string|undefined} The MIME type or undefined if we could not guess it.
 */
function guessMimeType(filename) {
  const fileExtension = filename.split('.').pop().toLowerCase();
  switch (fileExtension) {
    case 'png': return 'image/png';
    case 'gif': return 'image/gif';
    case 'svg': return 'image/xml+svg';
    case 'jpg': case 'jpeg': return 'image/jpeg';
    case 'webp': return 'image/webp';
    case 'bmp': return 'image/bmp';
    case 'htm': case 'html': return 'text/html';
    case 'sfv': return 'text/x-sfv';
    case 'txt': return 'text/plain';
  }

  // Skip over PAR files (.PAR, .P01, etc).
  if (fileExtension === 'par' || /^p\d\d$/.test(fileExtension)) {
    return 'application/octet-stream';
  }

  return undefined;
};

/**
 * Factory method that creates a Page from a File.
 * @param {UnarchivedFile} file
 * @return {Promise<Page>} A Promise that gets a Page (like an ImagePage).
 */
export const createPageFromFileAsync = function(file) {
  return new Promise((resolve, reject) => {
    const filename = file.filename;
    const mimeType = guessMimeType(filename);
    if (!mimeType) {
      resolve(new TextPage(filename, `Could not determine type of file "${filename}"`));
      return;
    }

    const dataURI = createURLFromArray(file.fileData, mimeType);

    if (mimeType.indexOf('image/') === 0) {
      const img = new Image();
      img.onload = () => { resolve(new ImagePage(filename, img)); };
      img.onerror = (e) => { resolve(new TextPage(filename, `Could not open file ${filename}`)); };
      img.src = dataURI;
    } else if (mimeType === 'text/html') {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', dataURI, true);
      xhr.onload = () => { resolve(new HtmlPage(filename, xhr.responseText)); };
      xhr.onerror = (e) => { reject(e); };
      xhr.send(null);
    } else if (mimeType.startsWith('text/')) {
      // TextPage.
      const xhr = new XMLHttpRequest();
      xhr.open('GET', dataURI, true);
      xhr.onload = () => {
        if (xhr.responseText.length < 1000 * 1024) {
          resolve(new TextPage(filename, xhr.responseText));
        } else {
          reject('Could not create a new page from file ' + filename);
        }
      };
      xhr.onerror = (e) => { reject(e); };
      xhr.send(null);
    } else if (mimeType === 'application/octet-stream') {
      resolve(new TextPage(filename, 'Could not display binary file "' + filename + '"'));
    }
  });
};
