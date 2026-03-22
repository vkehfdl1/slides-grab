const {
  buildPageOptions,
  getTargetRasterSize,
  main,
  parseArgs,
} = require('./src/pptx-raster-export.cjs');

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = {
  buildPageOptions,
  getTargetRasterSize,
  main,
  parseArgs,
};
