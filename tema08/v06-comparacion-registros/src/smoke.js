const endpoint = "/api/compare-records";
const message = "Compara PED-2026-001 con PED-2026-004";

const response = await fetch(`http://localhost:${process.env.PORT || 3000}${endpoint}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message })
});

const data = await response.json();
console.log(JSON.stringify(data, null, 2));
