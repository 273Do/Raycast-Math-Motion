import fs from "node:fs";
import path from "node:path";
import { toBlueprintJsonSchema } from "@/schema/blueprint";

export const OUTPUT_PATH = path.join(__dirname, "..", "gen", "blueprint.schema.json");

export const renderBlueprintJsonSchema = (): string => {
  return JSON.stringify(toBlueprintJsonSchema(), null, 2) + "\n";
};

if (require.main === module) {
  fs.writeFileSync(OUTPUT_PATH, renderBlueprintJsonSchema());
  console.log(`Wrote ${path.relative(process.cwd(), OUTPUT_PATH)}`);
}
