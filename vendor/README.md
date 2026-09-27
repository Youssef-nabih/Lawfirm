# Excel export dependency

`exceljs-4.4.0.min.js` is the browser bundle from the official `exceljs@4.4.0` npm package, under the adjacent MIT license. Loaded locally only when Excel export is requested. Office data is not sent to a spreadsheet service.

Upstream: https://github.com/exceljs/exceljs

SHA-256: `7e49da68588e250dbb8bba190d2caa8ab3787cc0284bda1d8b2f805c4df742c9`

The browser bundle generates XLSX in the deployed static site. The desktop artifact runtime is used only for local review, not shipped to browsers.
