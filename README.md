# 🌱 Plant Disease Prediction API

API untuk prediksi penyakit tanaman menggunakan AI dengan authentication dan tracking history.

![Node.js](https://img.shields.io/badge/Node.js-v18.0+-green)
![TensorFlow.js](https://img.shields.io/badge/TensorFlow.js-v4.15+-orange)
![MongoDB](https://img.shields.io/badge/MongoDB-v5.0+-green)

## ✨ Fitur Utama

- 🤖 **AI Prediction**: Deteksi penyakit tanaman dari foto daun
- 🔐 **Authentication**: Login/register dengan JWT
- 📊 **History Tracking**: Simpan riwayat prediksi
- 👥 **Role Management**: User, Admin, Moderator
- 📚 **API Documentation**: Swagger UI tersedia
- 🚀 **Ready for Production**: Deploy ke Vercel dengan 1 klik

## 🚀 Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/satriadhm/plant-disease-prediction-api.git
cd plant-disease-prediction-api
npm install
```

### 2. Setup Environment

```bash
cp .env.example .env
```

Edit `.env` file:
```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/plant_disease_api
JWT_SECRET=your-super-secret-key
CLIENT_ORIGIN=http://localhost:3000
```

### 3. Start Development

```bash
npm run dev
```

API akan berjalan di: `http://localhost:8000`

## 🌐 Deploy ke Vercel

### 1. Persiapan

1. Buat database di [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Fork/clone repository ini
3. Connect ke [Vercel](https://vercel.com)

### 2. Environment Variables di Vercel

Set variabel berikut di Vercel dashboard:

```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/plant_disease_api
JWT_SECRET=your-super-secret-jwt-key
ADMIN_USERNAME=admin
ADMIN_EMAIL=admin@yourcompany.com
ADMIN_PASSWORD=your-secure-password
CLIENT_ORIGIN=https://your-frontend-domain.com
NODE_ENV=production
```

### 3. Deploy

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

Database akan otomatis ter-seed saat pertama kali deploy! 🎉

## 📖 Cara Pakai API

### 1. Register User

```bash
curl -X POST https://your-api.vercel.app/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john_doe",
    "email": "john@example.com", 
    "password": "password123"
  }'
```

### 2. Login

```bash
curl -X POST https://your-api.vercel.app/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john_doe",
    "password": "password123"
  }'
```

### 3. Prediksi Penyakit

```bash
curl -X POST https://your-api.vercel.app/api/predict \
  -H "x-access-token: YOUR_JWT_TOKEN" \
  -F "image=@plant_leaf.jpg"
```

### 4. Lihat History

```bash
curl -X GET https://your-api.vercel.app/api/predictions/history \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

## 📋 Endpoints Utama

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `POST` | `/api/auth/signup` | Daftar akun baru |
| `POST` | `/api/auth/signin` | Login |
| `POST` | `/api/predict` | Prediksi penyakit tanaman |
| `GET` | `/api/predictions/history` | Riwayat prediksi |
| `GET` | `/api/docs` | Dokumentasi API (Swagger) |
| `GET` | `/health` | Health check |

## 🤖 Model AI

API ini menggunakan model CNN yang dilatih untuk mendeteksi:
- **Cabai**: Healthy, Leaf Curl, Leaf Spot, Whitefly
- **Jagung**: Healthy, Common Rust, Gray Leaf Spot, Northern Leaf Blight  
- **Padi**: Healthy, Brown Spot, Leaf Blast, Neck Blast
- **Tomat**: Healthy, Early Blight, Late Blight, Yellow Leaf Curl Virus

## 🔧 Development

### Project Structure

```
├── app/
│   ├── controllers/     # Business logic
│   ├── models/         # Database schemas
│   ├── routes/         # API routes
│   ├── middleware/     # Auth, upload, etc
│   └── config/         # Database, JWT config
├── models/             # AI model files
├── uploads/            # Uploaded images
├── server.js           # Main server file
└── api/index.js        # Vercel entry point
```

### Testing

```bash
npm test
```

### Model Health Check

```bash
curl https://your-api.vercel.app/api/model/health
```

## 📱 Frontend Integration

Contoh integrasi dengan JavaScript:

```javascript
// Upload gambar untuk prediksi
async function predictDisease(imageFile) {
  const formData = new FormData();
  formData.append('image', imageFile);
  
  const response = await fetch('https://your-api.vercel.app/api/predict', {
    method: 'POST',
    headers: {
      'x-access-token': localStorage.getItem('token')
    },
    body: formData
  });
  
  const result = await response.json();
  console.log('Prediksi:', result.data.predictedClass);
  console.log('Confidence:', result.data.confidence + '%');
}
```

## 🛠️ Troubleshooting

### CORS Error
Jika ada error CORS saat development:
1. Pastikan `CLIENT_ORIGIN` sudah benar di `.env`
2. Untuk ngrok, origin akan otomatis diizinkan
3. Restart server setelah ubah environment

### Model Not Loading
1. Pastikan semua file model ada di folder `models/`
2. Check health endpoint: `/api/model/health`
3. Lihat log server untuk error detail

### Database Connection
1. Pastikan MongoDB Atlas cluster sudah running
2. Check connection string di `MONGODB_URI`
3. Whitelist IP address di MongoDB Atlas

## 📄 License

ISC License - lihat file [LICENSE](LICENSE)

## 🙏 Support

- 📧 Email: glorioussatria@gmail.com
- 🐛 Issues: [GitHub Issues](https://github.com/satriadhm/plant-disease-prediction-api/issues)
- 📖 Docs: [API Documentation](https://your-api.vercel.app/api/docs)

---

Made with ❤️ by [G. Satria](https://github.com/satriadhm)