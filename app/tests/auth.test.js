const request = require("supertest");
const mongoose = require("mongoose");

// Import app setelah setup test environment
process.env.NODE_ENV = "test";
process.env.DB_URI = "mongodb://127.0.0.1:27017/auth_service_test";

const app = require("../../server");

describe("Auth API Tests", () => {
  beforeAll(async () => {
    // Tunggu koneksi database
    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  afterAll(async () => {
    // Cleanup database dan tutup koneksi
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  it("should register a new user", async () => {
    const res = await request(app).post("/api/auth/signup").send({
      username: "testuser",
      email: "testuser@example.com",
      password: "password123",
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("User was registered successfully!");
  });

  it("should not register with duplicate username", async () => {
    // First register a user
    await request(app).post("/api/auth/signup").send({
      username: "duplicateuser",
      email: "duplicate@example.com",
      password: "password123",
    });

    // Try to register with same username
    const res = await request(app).post("/api/auth/signup").send({
      username: "duplicateuser",
      email: "newduplicate@example.com",
      password: "newpassword",
    });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Failed! Username is already in use!");
  });

  it("should login successfully", async () => {
    // First register a user
    await request(app).post("/api/auth/signup").send({
      username: "loginuser",
      email: "login@example.com",
      password: "password123",
    });

    // Then try to login
    const res = await request(app).post("/api/auth/signin").send({
      username: "loginuser",
      password: "password123",
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });
});
