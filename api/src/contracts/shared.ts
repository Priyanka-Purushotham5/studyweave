import { readFileSync } from "node:fs";
import AjvModule from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
const Ajv = AjvModule as unknown as typeof AjvModule.default;
const addFormats =
  addFormatsModule as unknown as typeof addFormatsModule.default;
export const sharedSchemas = JSON.parse(
  readFileSync(
    new URL("../../../contracts/schemas.json", import.meta.url),
    "utf8",
  ),
);
const ajv = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true });
addFormats(ajv);
ajv.addSchema(sharedSchemas);
export function sharedValidator(name: string) {
  return ajv.getSchema(`${sharedSchemas.$id}#/$defs/${name}`)!;
}
