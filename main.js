import { Hono } from "hono";

// Ensure "repos" folder exists
try {
  await Deno.stat("repos");
} catch (e) {
  if (e instanceof Deno.errors.NotFound) {
    await Deno.mkdir("repos");
  }
}

const app = new Hono();

const trackMap = new Map();

// Serve index.html at /
app.get("/", async (c) => {
  try {
    const mainHtml = await Deno.readTextFile("index.html");
    return c.html(mainHtml);
  } catch (_) {
    return c.text("index.html not found", 404);
  }
});

// Clone a repo
app.post("/clone", async (c) => {
  const { gitUrl } = await c.req.json();
  const repoName = gitUrl.split("/").pop().replace(".git", "");
  try {
    await Deno.stat(`repos/${repoName}`);
    return c.json({ error: "Repo already exists", url: repoName }, 400);
  } catch (_) {
    // Not found, proceed to clone
  }

  const process = Deno.run({
    cmd: ["git", "clone", gitUrl, `repos/${repoName}`],
    stdout: "piped",
    stderr: "piped",
  });
  const [status, errOut] = await Promise.all([
    process.status(),
    process.stderrOutput(),
  ]);
  process.close();

  if (!status.success) {
    return c.json({ error: new TextDecoder().decode(errOut) }, 500);
  }
  return c.json({ url: `serve/${repoName}` });
});

// app.use("/serve/:repoName/*", async (c, next) => {
//   const referer = c.req.raw.headers.get("referer");
//   const repoName = referer ? referer.split("/").pop() : c.req.param("repoName");
//   console.log( repoName );
//   const repoPath = `repos/${repoName}`;
//   console.log( repoPath );

//   try {
//     await Deno.stat(repoPath);
//   } catch {
//     return c.text("Repo not found", 404);
//   }

//   return serveStatic({ root: repoPath })(c, next);
// });


app.get("/index/:file", async (c) => {
  const filePath = c.req.param("file");
  let fileType = c.req.raw.headers.get("accept");
  try {
    const ifEnd = c.req.url.split(".")[1];
    if(ifEnd && ifEnd === "ico"){
      fileType = "image/x-icon";
    }
    //else if(ifEnd && ifEnd === "css"){}
    const getFile = await Deno.readFile(filePath);
    return c.newResponse(getFile, {
      headers: { "Content-Type": fileType },
    }, 200);
  } catch (error) {
    console.log(error.message);
    return c.text("File not found", 404);
  }
});

app.get("/serve/:repoName/*", async (c) => {
  const Cookies = c.req.headers.get("cookie")?.split("; ")
  .filter((cookie) => {
    const isNotUndefined = cookie.startsWith("repoId") && !cookie.includes("undefined");
    if (!isNotUndefined) return false;
    const cookieValue = cookie?.split("=")[1];
    const isInTrackMap = trackMap.has(cookieValue);
    return isNotUndefined && isInTrackMap;
  });
  const repoId = Cookies ? Cookies[0]?.split("=")[1] : null;
  let repoName = c.req.param("repoName");
  let fileType = c.req.url.split(".")[1];
  let fileNames = c.req.url.split("/");
  if(fileType){
    const ifEnd = c.req.url.split(".")[1];
    if(ifEnd && ifEnd === "ico"){
      fileType = "image/x-icon";
    }
    try{
    await Deno.stat(`repos/${repoName}`);
    }catch{
      fileNames = c.req.url.split("serve/").pop();
    }
    
    
    const referer = c.req.raw.headers.get("referer");
    if(referer){
      fileNames = referer.split("serve/").pop()+"/"+c.req.url.split("serve/").pop();
      fileNames = "repos/"+fileNames;
    }
    //serve it static
    try{
      if(referer?.split(".")[1]){
        const repoName = trackMap.get(repoId);
        const filePath = `repos/${repoName}/${c.req.url.split("serve/")[1]}`;
        const getFile = await Deno.readFile(filePath);
        return c.newResponse(getFile, {
          headers: { "Content-Type": fileType },
        }, 200);
      }
    }
    catch{
      return c.text("File not found", 404);
    }


    const type = c.req.raw.headers.get("accept");
    const getFile = await Deno.readFile(fileNames);
    return c.newResponse(getFile, {
      headers: { "Content-Type": type },
    }, 200);
  }
  const indexPath = `repos/${repoName}/index.html`;

  try {
    const indexContent = await Deno.readFile(indexPath);
    const randomId = Math.random().toString(36).substring(7);
    trackMap.set(randomId, repoName);

    return c.newResponse(indexContent, {
      headers: {
        "Content-Type": "text/html",
        "Set-Cookie": `repoId=${randomId}; HttpOnly; Path=/`,
      },
    },200)
  } catch {
    return c.text("index.html not found", 404);
  }
});

// If nothing else matched, return 404
app.notFound((c) => c.text("Page not found", 404));

export default app;
