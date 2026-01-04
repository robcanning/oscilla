module.exports = function (eleventyConfig) {
  // Copy static assets to the output folder
  eleventyConfig.addPassthroughCopy("assets");
  // eleventyConfig.addPassthroughCopy("compositions/polygonfield2026/images");
  eleventyConfig.addPassthroughCopy("compositions/**/images/*");

  
  return {
    dir: {
      input: ".",
      output: "../docs",
      includes: "_includes"
    },
    markdownTemplateEngine: "njk"
  };
};
