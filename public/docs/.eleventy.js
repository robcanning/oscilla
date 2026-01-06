module.exports = function (eleventyConfig) {

  return {
    dir: {
      input: "src",
      output: "site",
      includes: "_includes",
      layouts: "_includes"
    },

    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk"
  };
};
