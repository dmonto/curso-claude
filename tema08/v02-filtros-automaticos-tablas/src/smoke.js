const endpoint = "/api/table-filter";
const message = "Dame facturas vencidas de riesgo alto con importe mayor que 100";

const response = await fetch(`http://localhost:${process.env.PORT || 3000}${endpoint}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message })
});

const data = await response.json();
console.log(JSON.stringify(data, null, 2));
