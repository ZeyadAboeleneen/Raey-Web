const http = require('http');

const data = JSON.stringify({
  items: [
    {
      id: "3998-custom-rent-2026-04-30-2026-05-02",
      productId: "3998",
      name: "M4912",
      price: 8000,
      originalPrice: 19600,
      size: "custom",
      volume: "cm",
      image: "https://res.cloudinary.com/dyhawwspq/image/upload/v1776965455/products/erp-3998-454998.jpg",
      branch: "mona-saleh",
      quantity: 1,
      type: "rent",
      collection: "soiree",
      rentStart: "2026-04-30",
      rentEnd: "2026-05-02",
      isExclusive: false,
      customMeasurements: {
        unit: "cm",
        values: {
          shoulder: "1",
          bust: "1",
          waist: "J",
          hips: "J",
          sleeve: "J",
          length: "J"
        }
      },
      reviewed: false
    }
  ],
  total: 8000,
  shippingAddress: {
    name: "Rawan Amr The ",
    email: "rawanamr20002@icloud.com",
    phone: "+20 01024285771",
    secondaryPhone: "+20 01024285772",
    address: "The ",
    city: "T",
    country: "Egypt",
    countryCode: "EG",
    postalCode: ""
  },
  paymentMethod: "cod"
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/orders',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.on('data', (d) => {
    process.stdout.write(d);
  });
});

req.on('error', (error) => {
  console.error(error);
});

req.write(data);
req.end();
