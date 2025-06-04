module.exports = function (eleventyConfig) {
  // Copy static assets to the output folder
  eleventyConfig.addPassthroughCopy("assets");

  return {
    dir: {
      input: ".",
      output: "../docs",
      includes: "_includes"
    },
    markdownTemplateEngine: "njk"
  };
};
