const request = require("supertest");
const mongoose = require("mongoose");

// Import app setelah setup test environment
process.env.NODE_ENV = "test";
process.env.DB_URI = "mongodb://127.0.0.1:27017/auth_service_test";

const app = require("../../server");

describe("User API Tests", () => {
  let token;

  beforeAll(async () => {
    // Tunggu koneksi database
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Register dan login user untuk mendapatkan token
    await request(app).post("/api/auth/signup").send({
      username: "testadmin",
      email: "testadmin@example.com",
      password: "adminpassword",
    });

    const res = await request(app).post("/api/auth/signin").send({
      username: "testadmin",
      password: "adminpassword",
    });
    token = res.body.accessToken;
  });

  afterAll(async () => {
    // Cleanup database dan tutup koneksi
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  it("should access public content", async () => {
    const res = await request(app).get("/api/test/all");
    expect(res.statusCode).toBe(200);
    expect(res.text).toBe("Public Content.");
  });

  it("should access user content with token", async () => {
    const res = await request(app)
      .get("/api/test/user")
      .set("x-access-token", token);

    expect(res.statusCode).toBe(200);
    expect(res.text).toBe("User Content.");
  });

  it("should return 403 for user without token", async () => {
    const res = await request(app).get("/api/test/user");

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe("No token provided!");
  });
});
