/**
 * ChatVolt Conversation Cleanup Agent - GAS Backend
 * Serves the UI and acts as a server-side proxy to bypass CORS restrictions.
 */

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Index')
      .setTitle('ChatVolt Conversation Cleanup')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Proxy HTTP requests from the client to the ChatVolt API.
 * This bypasses browser CORS policies using Google's infrastructure.
 * 
 * @param {string} url The target API endpoint
 * @param {Object} options Fetch options (method, headers, body)
 * @returns {Object} Response object containing status, body, and headers
 */
function proxyFetch(url, options) {
  try {
    const params = {
      method: options.method || 'GET',
      headers: options.headers || {},
      muteHttpExceptions: true // Ensures we handle errors gracefully instead of throwing in GAS
    };
    
    if (options.body) {
      params.payload = options.body;
    }
    
    const response = UrlFetchApp.fetch(url, params);
    
    return {
      status: response.getResponseCode(),
      body: response.getContentText(),
      headers: response.getHeaders()
    };
  } catch (error) {
    return {
      status: 500,
      error: error.toString()
    };
  }
}
