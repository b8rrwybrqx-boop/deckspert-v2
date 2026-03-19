import { artifactInputSchema, type Artifact } from "../schemas/artifact.js";

function createArtifactId(label: string, index: number): string {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${slug || "artifact"}-${index + 1}`;
}

export function createArtifacts(inputs: unknown[]): Artifact[] {
  return inputs.map((input, index) => {
    const parsed = artifactInputSchema.parse(input);
    return {
      ...parsed,
      id: parsed.id ?? createArtifactId(parsed.label, index)
    };
  });
}
