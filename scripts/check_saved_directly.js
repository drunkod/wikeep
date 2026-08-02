import http from "node:http";

async function getTargets() {
  return new Promise((resolve, reject) => {
    http.get("http://127.0.0.1:9222/json", (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on("error", reject);
  });
}

async function runCDP(wsUrl, method, params) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      const msg = JSON.stringify({
        id: 1,
        method,
        params
      });
      ws.send(msg);
    };
    ws.onmessage = (event) => {
      const resp = JSON.parse(event.data);
      if (resp.id === 1) {
        ws.close();
        if (resp.error) {
          reject(resp.error);
        } else {
          resolve(resp.result);
        }
      }
    };
    ws.onerror = (err) => {
      reject(err);
    };
  });
}

async function evaluate(wsUrl, expression) {
  const result = await runCDP(wsUrl, "Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  return result.result;
}

async function main() {
  const targets = await getTargets();
  const sidepanel = targets.find(t => t.title === "Wikeep");
  if (!sidepanel) {
    console.error("Sidepanel not found");
    return;
  }

  console.log(`Connecting to Wikeep sidepanel: ${sidepanel.webSocketDebuggerUrl}`);

  const res = await evaluate(
    sidepanel.webSocketDebuggerUrl,
    `
    new Promise((resolve) => {
      chrome.runtime.sendMessage({ command: "LIST_WIKI_PAGES" }, (response) => {
        if (Array.isArray(response)) {
          resolve(response.map(p => ({
            id: p.id,
            title: p.title,
            markdownSource: p.markdownSource,
            hasDiagrams: p.hasDiagrams,
            hasMermaid: p.markdown.includes("mermaid"),
            hasOmitted: p.markdown.includes("Diagram omitted")
          })));
        } else {
          resolve([]);
        }
      });
    });
    `
  );
  console.log("Saved pages stats:", JSON.stringify(res.value, null, 2));
}

main().catch(console.error);
