const endpoint = "/api/nl-query";
const message = "Muéstrame pedidos retrasados de Madrid ordenados por mayor importe";

const response = await fetch(`http://localhost:${process.env.PORT || 3000}${endpoint}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message })
});

const data = await response.json();
console.log(JSON.stringify(data, null, 2));
