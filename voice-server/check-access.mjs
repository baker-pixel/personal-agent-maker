import "dotenv/config";
import { BedrockClient, ListFoundationModelsCommand } from "@aws-sdk/client-bedrock";

const regions = ["ap-northeast-1", "us-east-1", "us-west-2"];

for (const region of regions) {
  try {
    const client = new BedrockClient({ region });
    const res = await client.send(new ListFoundationModelsCommand({ byProvider: "Amazon" }));
    const sonic = (res.modelSummaries || []).filter((m) => m.modelId.includes("sonic"));
    console.log(`${region}: OK — sonic models: ${sonic.map((m) => m.modelId).join(", ") || "none"}`);
  } catch (e) {
    console.log(`${region}: ERROR — ${e.name}: ${e.message}`);
  }
}
