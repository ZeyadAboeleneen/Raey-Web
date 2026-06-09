(async () => {
  try {
    console.log("Fetching Soiree items from local API...");
    const res = await fetch("http://localhost:3000/api/items?collection=soiree&limit=5");
    console.log("Response status:", res.status);
    
    if (res.ok) {
      const data = await res.json();
      console.log("Fetched items count in this page:", data.length);
      console.log("Headers:");
      console.log("  X-Total-Count:", res.headers.get("X-Total-Count"));
      console.log("  X-Total-Pages:", res.headers.get("X-Total-Pages"));
      
      console.log("\nSample items:");
      data.forEach(item => {
        console.log(`- ID: ${item.id}, Name: ${item.name}, Collection: ${item.collection}, Price: ${item.price}, Category_id: ${item.lineId}`);
      });
    } else {
      const text = await res.text();
      console.error("API error response:", text);
    }
    process.exit(0);
  } catch (err) {
    console.error("Failed to fetch from API:", err);
    process.exit(1);
  }
})();
