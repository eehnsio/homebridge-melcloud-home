"use strict";
const platform_1 = require("./platform");
const settings_1 = require("./settings");
module.exports = (api) => {
    api.registerPlatform(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, platform_1.MELCloudHomePlatform);
};
//# sourceMappingURL=index.js.map