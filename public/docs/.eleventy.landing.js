// Landing page Eleventy config for oscilla.kompot.si/
// Run from: oscilla/public/docs/

module.exports = function (eleventyConfig) {

  // Copy landing page assets to root
  eleventyConfig.addPassthroughCopy("landing/landing.css");
  eleventyConfig.addPassthroughCopy("landing/logo-icon.png");
  
  // Copy binaries from ../../dist/ to /builds/
  eleventyConfig.addPassthroughCopy({ "../../dist": "builds" });

  return {
    dir: {
      input: "landing",                    // Read from ./landing/
      includes: "../src/_includes",        // Reuse includes from src/_includes/
      output: "../../kompot_docs"          // Same level as docs output
    },
    
    pathPrefix: "/",                       // Root-level paths
    
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk"
  };
};
