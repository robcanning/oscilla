const fs = require("fs");
const path = require("path");

module.exports = function (eleventyConfig) {

  // ---- Existing passthroughs ----
  eleventyConfig.addPassthroughCopy("assets");
  eleventyConfig.addPassthroughCopy("compositions/**/images/*");
  eleventyConfig.addPassthroughCopy("compositions/**/videos/*");
  eleventyConfig.addPassthroughCopy("compositions/**/supercollider/*");
  eleventyConfig.addPassthroughCopy("compositions/**/oscilla/*");

  // ---- Copy Oscilla in-app docs into website after build ----
  eleventyConfig.on("afterBuild", () => {
    const src = path.join(__dirname, "../public/docs/site");
    const dest = path.join(__dirname, "../docs/docs");

    if (fs.existsSync(src)) {
      // wipe old copy
      fs.rmSync(dest, { recursive: true, force: true });

      // copy fresh build
      fs.cpSync(src, dest, { recursive: true });

      console.log("✓ Copied Oscilla docs into website → docs/oscilla");
    } else {
      console.warn("⚠ Oscilla docs not built yet — skipping copy");
    }
  });

return {
  dir: {
    input: ".",
    output: "../docs",
    includes: "_includes",
  },
  pathPrefix: "/docs/",
  markdownTemplateEngine: "njk"
};

};
