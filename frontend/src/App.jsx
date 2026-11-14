import { useEffect, useState } from "react";

export default function App() {
  const [msg, setMsg] = useState("loading...");
  useEffect(() => {
    fetch("/api/hello")
      .then((r) => r.json())
      .then((d) => setMsg(d.message))
      .catch((e) => setMsg(`Error: ${e.message}`));
  }, []);
  return <h1>{msg}</h1>;
}
