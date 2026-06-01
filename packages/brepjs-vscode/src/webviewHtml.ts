import * as vscode from 'vscode';

export function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const webviewDist = vscode.Uri.joinPath(extensionUri, 'dist', 'webview');
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewDist, 'main.js'));

  // The CSP allows:
  //  - scripts only from the extension dist (vscode-webview-resource: scheme)
  //  - blob: for Three.js workers and object URLs
  //  - connect-src for Three.js's FileLoader fetching the GLB via vscode-webview-resource:
  //  - unsafe-inline for styles (R3F injects canvas styles at runtime)
  const csp = [
    `default-src 'none'`,
    `script-src ${webview.cspSource} blob:`,
    `style-src 'unsafe-inline'`,
    `img-src ${webview.cspSource} data: blob:`,
    `connect-src ${webview.cspSource} blob:`,
    `worker-src blob:`,
  ].join('; ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <style>
    html, body, #root {
      margin: 0;
      height: 100%;
      width: 100%;
      background: #1a1d21;
      overflow: hidden;
    }
  </style>
  <title>brepjs Preview</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="${scriptUri.toString()}"></script>
</body>
</html>`;
}
