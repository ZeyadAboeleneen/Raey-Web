async function test() {
  const res = await fetch("http://localhost:3000/api/admin/orders/ORD-1777153664776-T5ITKO0QX", {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer test' } // This will probably give 401, but we don't know the admin token. Wait, if it gives 401, the error isn't 500!
  });
  console.log(res.status);
  console.log(await res.text());
}
test();
