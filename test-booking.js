async function test() {
  try {
    const res = await fetch("http://localhost:3000/api/items/3987/availability");
    const data = await res.json();
    console.log("Bookings:", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(err);
  }
}
test();
