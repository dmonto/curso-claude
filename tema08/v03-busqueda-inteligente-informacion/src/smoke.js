const endpoint = "/api/search";
const message = "Busca información sobre facturas vencidas y pedidos retrasados";

const response = await fetch(`http://localhost:${process.env.PORT || 3000}${endpoint}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message })
});

const data = await response.json();
console.log(JSON.stringify(data, null, 2));
