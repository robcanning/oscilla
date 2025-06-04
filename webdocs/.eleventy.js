module.exports = function (eleventyConfig) {
  // Copy static assets to the output folder
  eleventyConfig.addPassthroughCopy("assets");

  return {
    dir: {
      input: ".",
      output: "site",
      includes: "_includes"
    },
    markdownTemplateEngine: "njk"
  };
};
