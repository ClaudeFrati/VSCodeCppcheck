/**
 * Generates assets/cppcheck.schema.json based on
 * package.json.contributes.configuration "cppcheck.args.*"
 **/

import * as fs from "node:fs";
import * as util from "node:util";

import {default as pkgJson} from "../package.json" assert {type: "json"};

const writeFilePromise = util.promisify(fs.writeFile);

const configSchema = pkgJson.contributes.configuration[0].properties;

const schema = {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {},
};
for (let configKey in configSchema) {
    if (configKey.startsWith("cppcheck.args.")) {
        const key = configKey.substring("cppcheck.args.".length);
        schema.properties[key] = configSchema[configKey];
    }
}

await writeFilePromise("assets/cppcheck.schema.json", JSON.stringify(schema, null, 4));