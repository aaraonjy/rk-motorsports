# RK Motorsports 🏎️

A full importable MVP for a custom ECU tuning portal built with Next.js.

## 🚀 Features

This project provides a robust foundation for a custom ECU tuning service, including:

*   **Modern Stack:** Built with Next.js 15, TypeScript, and Tailwind CSS for a performant and maintainable application.
*   **Database:** Utilizes Prisma and SQLite for straightforward local development and easy setup.
*   **Authentication:** Implements custom login and registration flows.
*   **User Dashboard:** A dedicated dashboard for customers to manage their orders and profile.
*   **Admin Dashboard:** Comprehensive tools for administrators to manage orders, users, and services.
*   **Product Catalog:** A system to display and manage available tuning products.
*   **Custom Tune Orders:** An intuitive form for customers to submit custom tuning requests.
*   **File Management:** Supports local file uploads for customer original ECU files and download routes for delivered tuned files.

## 🛠️ Installation

To get started with this project, follow these steps:

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/aaraonjy/rk-motorsports.git
    cd rk-motorsports
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    # or
    yarn install
    # or
    pnpm install
    ```

3.  **Set up environment variables:**
    Create a `.env` file in the root of your project based on the `.env.example` file. You may need to configure database connection strings and other sensitive information.

    ```bash
    cp .env.example .env
    ```
    Edit the `.env` file with your specific configurations.

4.  **Run database migrations:**
    ```bash
    npx prisma migrate dev --name init
    ```

5.  **Start the development server:**
    ```bash
    npm run dev
    # or
    yarn dev
    # or
    pnpm dev
    ```

    The application will be accessible at `http://localhost:3000` (or the port specified in your `.env` file).

## 📚 Usage

This repository serves as a complete MVP and can be imported into your project. The core functionality includes:

*   **User Authentication:** Navigate to `/login` and `/register` for authentication.
*   **Customer Dashboard:** Access `/dashboard` as a logged-in customer.
*   **Admin Dashboard:** Access `/admin` for administrative functions (requires appropriate roles/permissions).
*   **Shop & Services:** Explore product offerings at `/shop` and `/services`.
*   **Order Placement:** Utilize the custom tune order form within the application.
*   **File Uploads:** Customers can upload original ECU files through the order interface.
*   **File Downloads:** Tuned files are made available for download via designated routes.

## 🤝 Contributing

We welcome contributions to improve RK Motorsports. Please follow these guidelines:

1.  **Fork the repository.**
2.  **Create a new branch** for your feature or bug fix (`git checkout -b feature/AmazingFeature`).
3.  **Commit your changes** (`git commit -m 'Add some AmazingFeature'`).
4.  **Push to the branch** (`git push origin feature/AmazingFeature`).
5.  **Open a Pull Request.**

Please ensure your code adheres to the project's coding standards and includes appropriate tests.

## 📜 License

This project is not currently under a specified license.
```

---

<p align="center">
  <a href="https://readmeforge.app?utm_source=badge">
    <img src="https://readmeforge.app/badge.svg" alt="Made with ReadmeForge" height="20">
  </a>
</p>