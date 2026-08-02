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
  const target = targets.find(t => t.url.includes("2-core-reconciler-architecture"));

  if (!target) {
    console.error("Target tab not found");
    return;
  }

  console.log(`Connecting to tab: ${target.webSocketDebuggerUrl}`);

  const res = await evaluate(
    target.webSocketDebuggerUrl,
    `
    (() => {
      // Find all elements containing 'renderWithHooks'
      const allElements = Array.from(document.querySelectorAll('*'));
      const matches = allElements.filter(el => {
        // We only want leaf elements or elements with text content direct match
        if (el.children.length > 0) {
          // If all children also contain it, let the children handle it
          const childrenMatch = Array.from(el.children).some(c => c.textContent.includes('renderWithHooks'));
          if (childrenMatch) return false;
        }
        return el.textContent.includes('renderWithHooks');
      });

      return matches.map(el => ({
        tagName: el.tagName,
        className: el.className,
        id: el.id,
        text: el.textContent.substring(0, 500),
        html: el.outerHTML.substring(0, 500),
        attributes: Array.from(el.attributes).map(a => a.name + '=' + a.value)
      }));
    })()
    `
  );
  console.log("Matches:", JSON.stringify(res.value, null, 2));
}

main().catch(console.error);
