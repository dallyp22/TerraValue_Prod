// Script to set up OpenAI vector store for agricultural land data
import OpenAI from "openai";
import fs from "fs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function setupVectorStore() {
  try {
    console.log("Creating vector store for agricultural land data...");
    
    // Create vector store
    const vectorStore = await openai.vectorStores.create({
      name: "agricultural_land_valuations",
      expires_after: {
        anchor: "last_active_at",
        days: 365
      }
    });
    
    console.log("Vector store created:", vectorStore.id);
    console.log("Add this ID to your environment as VECTOR_STORE_ID:", vectorStore.id);
    
    // You would upload your agricultural data files here
    // For example:
    // const file = await openai.files.create({
    //   file: fs.createReadStream("path/to/your/agricultural_data.pdf"),
    //   purpose: "assistants"
    // });
    // 
    // await openai.vectorStores.files.create(vectorStore.id, {
    //   file_id: file.id
    // });
    
    return vectorStore.id;
  } catch (error) {
    console.error("Failed to create vector store:", error);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setupVectorStore();
}

export { setupVectorStore };