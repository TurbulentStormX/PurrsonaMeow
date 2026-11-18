
const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const mongoose = require("mongoose");
const Reservation = require("./models/Reservation");
const crypto = require("crypto");

require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;


// ==========================================
// CONNECT TO MONGODB
// ==========================================

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log("MongoDB connected successfully!"))
    .catch((error) => console.error("MongoDB connection error:", error.message));


// ==========================================
// MIDDLEWARE
// ==========================================

app.use(cors());
app.use(express.json());


// ==========================================
// EMAIL TRANSPORTER
// ==========================================

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});


// ==========================================
// TEST ROUTE
// ==========================================

app.get("/", (req, res) => {
    res.send("Cat Cafe Backend is running!");
});


// ==========================================
// CREATE RESERVATION + BOOKING RECEIVED EMAIL
// ==========================================

app.post("/reservations", async (req, res) => {
    console.log("Reservation request body:", req.body);

    try {
        const {
            code,
            name,
            email,
            phone,
            sessionId,
            session,
            roomId,
            roomCode,
            roomName,
            zone,
            date,
            time,
            hours,
            endTime,
            guests,
            requests,
            cats,
            catNames,
            handler,
            handlerUsername,
            handlerBy,
            rateName,
            pricePerHour,
            amount,
            paid,
            payment,
            status,
            createdAt
        } = req.body;


        // Check required fields
        if (
            !code || !name || !email || !phone ||
            !sessionId || !session || !date || !time || !guests
        ) {
            return res.status(400).json({
                message: "Please provide all required reservation details."
            });
        }


        // Save reservation to MongoDB
        const reservation = await Reservation.create({
            code,
            name,
            email: email.trim().toLowerCase(),
            phone,
            sessionId,
            session,
            roomId,
            roomCode,
            roomName,
            zone,
            date,
            time,
            hours,
            endTime,
            guests,
            requests: requests || "",
            cats: cats || [],
            catNames: catNames || [],
            handler: handler || "",
            handlerUsername,
            handlerBy,
            rateName,
            pricePerHour,
            amount,
            paid: paid ?? false,
            payment: payment ?? null,
            status: status || "Assigned",
            checkedIn: 0,
            createdAt: createdAt || new Date().toISOString()
        });


        
        // ==========================================
        // SEND BOOKING CONFIRMATION EMAIL AUTOMATICALLY
        // ==========================================

        let emailSent = false;

        try {
            const zoneCode = reservation.roomCode || reservation.zone || reservation.roomName || "Not assigned";

            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: reservation.email,

                subject: "🐱 Purrsona Meow - Your Booking is Confirmed!",

                // Plain text version
                text: `
Hello ${reservation.name}!

Good news! Your reservation at Purrsona Meow has been successfully confirmed.

YOUR CONFIRMED RESERVATION DETAILS

Reservation Code: ${reservation.code}
Session: ${reservation.session}
Date: ${reservation.date}
Time: ${reservation.time} - ${reservation.endTime || ""}
Number of Guests: ${reservation.guests}
Room: ${reservation.roomName || ""}
Zone Code: ${zoneCode}
Cat Handler: ${reservation.handler || ""}

Total Amount: S$${Number(reservation.amount || 0).toFixed(2)}
Payment Status: ${reservation.paid ? "Paid" : "Unpaid"}

Please keep your reservation code for future reference.

We look forward to welcoming you!

With love,
The Purrsona Meow Team 🐾
                `,

                // HTML version
                html: `
                <div style="
                    font-family: Arial, sans-serif;
                    background-color: #F8F4EC;
                    padding: 35px 15px;
                    color: #5C5048;
                ">

                    <div style="
                        max-width: 550px;
                        margin: auto;
                        background-color: #FFFDF9;
                        border-radius: 18px;
                        overflow: hidden;
                        border: 1px solid #EADFD2;
                    ">

                        <!-- HEADER -->
                        <div style="
                            background-color: #EADFD2;
                            text-align: center;
                            padding: 30px 20px;
                        ">
                            <h1 style="
                                color: #A96F5F;
                                font-size: 28px;
                                margin: 0;
                                letter-spacing: 2px;
                            ">
                                PURRSONA MEOW 🐱
                            </h1>

                            <p style="color: #77675C; font-size: 13px;">
                                Sipping Happiness, Purrfectly Brewed.
                            </p>
                        </div>

                        <!-- MAIN CONTENT -->
                        <div style="padding: 30px 28px;">

                            <h2 style="
                                color: #C9826D;
                                text-align: center;
                                font-size: 23px;
                            ">
                                Your Booking is Confirmed! ♡
                            </h2>

                            <p>Hello ${reservation.name}!</p>

                            <p style="line-height: 1.7;">
                                Thank you for choosing <strong>Purrsona Meow</strong>!
                                Your reservation has been successfully confirmed.
                                We can't wait to welcome you!
                            </p>

                            <!-- RESERVATION CODE -->
                            <div style="
                                background-color: #F8F4EC;
                                border: 1px dashed #C9826D;
                                border-radius: 12px;
                                padding: 18px;
                                text-align: center;
                                margin: 25px 0;
                            ">
                                <p style="color: #8C8178; font-size: 12px;">
                                    YOUR RESERVATION CODE
                                </p>

                                <h2 style="
                                    color: #C9826D;
                                    font-size: 25px;
                                    margin: 0;
                                    letter-spacing: 2px;
                                ">
                                    ${reservation.code}
                                </h2>
                            </div>

                            <!-- BOOKING DETAILS -->
                            <h3 style="
                                color: #A96F5F;
                                border-bottom: 2px solid #EADFD2;
                                padding-bottom: 10px;
                            ">
                                Your Confirmed Reservation Details
                            </h3>

                            <table style="
                                width: 100%;
                                border-collapse: collapse;
                                font-size: 14px;
                            ">
                                <tr>
                                    <td style="padding: 10px 5px; color: #8C8178;">Session</td>
                                    <td style="padding: 10px 5px; text-align: right;">
                                        <strong>${reservation.session}</strong>
                                    </td>
                                </tr>

                                <tr style="background-color: #F8F4EC;">
                                    <td style="padding: 10px 5px; color: #8C8178;">Date</td>
                                    <td style="padding: 10px 5px; text-align: right;">
                                        <strong>${reservation.date}</strong>
                                    </td>
                                </tr>

                                <tr>
                                    <td style="padding: 10px 5px; color: #8C8178;">Time</td>
                                    <td style="padding: 10px 5px; text-align: right;">
                                        <strong>${reservation.time} - ${reservation.endTime || ""}</strong>
                                    </td>
                                </tr>

                                <tr style="background-color: #F8F4EC;">
                                    <td style="padding: 10px 5px; color: #8C8178;">Guests</td>
                                    <td style="padding: 10px 5px; text-align: right;">
                                        <strong>${reservation.guests}</strong>
                                    </td>
                                </tr>

                                <tr>
                                    <td style="padding: 10px 5px; color: #8C8178;">Room</td>
                                    <td style="padding: 10px 5px; text-align: right;">
                                        <strong>${reservation.roomName || "-"}</strong>
                                    </td>
                                </tr>

                                <tr style="background-color: #F8F4EC;">
                                    <td style="padding: 10px 5px; color: #8C8178;">Zone Code</td>
                                    <td style="padding: 10px 5px; text-align: right;">
                                        <strong>${zoneCode}</strong>
                                    </td>
                                </tr>

                                <tr>
                                    <td style="padding: 10px 5px; color: #8C8178;">Cat Handler</td>
                                    <td style="padding: 10px 5px; text-align: right;">
                                        <strong>${reservation.handler || "-"}</strong>
                                    </td>
                                </tr>
                            </table>

                            <!-- PAYMENT DETAILS -->
                            <div style="
                                background-color: #F8F4EC;
                                border-radius: 10px;
                                padding: 15px;
                                margin-top: 20px;
                            ">
                                <p style="margin: 5px 0;">
                                    <strong>Total Amount:</strong>
                                    S$${Number(reservation.amount || 0).toFixed(2)}
                                </p>

                                <p style="margin: 5px 0;">
                                    <strong>Payment Status:</strong>
                                    ${reservation.paid ? "Paid" : "Unpaid"}
                                </p>

                                <p style="font-size: 13px; margin-bottom: 0;">
                                    You can complete your payment through the Sessions page.
                                </p>
                            </div>

                            <!-- REMINDER -->
                            <div style="
                                background-color: #FDF1E9;
                                border-radius: 10px;
                                padding: 15px;
                                margin-top: 20px;
                                font-size: 13px;
                                line-height: 1.6;
                            ">
                                <strong style="color: #A96F5F;">
                                    ♡ A little reminder
                                </strong>

                                <p style="margin-bottom: 0;">
                                    Please keep your reservation code safe.
                                    You can use it to check your booking and payment status.
                                </p>
                            </div>

                            <p style="text-align: center; margin-top: 28px;">
                                We look forward to welcoming you! 🐾
                            </p>

                        </div>

                        <!-- FOOTER -->
                        <div style="
                            background-color: #EADFD2;
                            text-align: center;
                            padding: 20px;
                            color: #77675C;
                            font-size: 12px;
                        ">
                            <strong>The Purrsona Meow Team ♡</strong>

                            <p>
                                Thank you for being part of our little cat-loving family!
                            </p>
                        </div>

                    </div>
                </div>
                `
            };

            await transporter.sendMail(mailOptions);

            emailSent = true;

            console.log("Booking confirmation email sent!");

        } catch (emailError) {
            console.error("Email sending error:", emailError.message);
        }

        // Send response to frontend
        res.status(201).json({
            message: emailSent
                ? "Reservation created and confirmation email sent successfully!"
                : "Reservation created, but confirmation email could not be sent.",
            reservation,
            emailSent
        });

            } catch (error) {
        console.error("Reservation error:", error.message);

        if (error.code === 11000) {
            return res.status(409).json({
                message: "This reservation code already exists."
            });
        }

        res.status(500).json({
            message: "Failed to create reservation."
        });
    }
});

// ==========================================
// GET ALL RESERVATIONS
// ==========================================

app.get("/reservations", async (req, res) => {
    try {
        const reservations = await Reservation.find();

        res.json({
            message: "Reservations retrieved successfully!",
            reservations
        });

    } catch (error) {
        console.error("Get reservations error:", error.message);

        res.status(500).json({
            message: "Failed to retrieve reservations."
        });
    }
});


// ==========================================
// GET ONE RESERVATION USING RESERVATION CODE
// ==========================================

app.get("/reservations/:code", async (req, res) => {
    try {
        const reservation = await Reservation.findOne({
            code: req.params.code
        });

        if (!reservation) {
            return res.status(404).json({
                message: "Reservation not found."
            });
        }

        res.json({
            message: "Reservation retrieved successfully!",
            reservation
        });

    } catch (error) {
        console.error("Get reservation error:", error.message);

        res.status(500).json({
            message: "Failed to retrieve reservation."
        });
    }
});


// ==========================================
// PROCESS RESERVATION PAYMENT
// ==========================================

app.post("/reservations/:code/pay", async (req, res) => {
    try {
        const { method, email } = req.body;
        const code = req.params.code.toUpperCase();

        // Find the reservation in MongoDB
        const reservation = await Reservation.findOne({ code });

        if (!reservation) {
            return res.status(404).json({
                message: "Reservation not found."
            });
        }

        // Check that the reservation belongs to this customer
        if (
            !email ||
            reservation.email.toLowerCase() !== email.trim().toLowerCase()
        ) {
            return res.status(403).json({
                message: "You are not authorised to pay for this reservation."
            });
        }

        // Only assigned reservations can be paid
        if (reservation.status !== "Assigned") {
            return res.status(400).json({
                message: "This reservation cannot be paid."
            });
        }

        // Prevent duplicate payments
        if (reservation.paid) {
            return res.status(400).json({
                message: "This reservation has already been paid."
            });
        }

        // Validate payment method
        if (!["PayNow", "Card"].includes(method)) {
            return res.status(400).json({
                message: "Invalid payment method."
            });
        }

        // Generate a practice payment reference
        const paymentRef =
            "PAY-" +
            Date.now() +
            "-" +
            crypto.randomBytes(3).toString("hex").toUpperCase();

        // Update payment details
        reservation.paid = true;
        reservation.payment = {
            method: method,
            ref: paymentRef,
            amount: reservation.amount,
            paidAt: new Date().toISOString()
        };

       
        // Save payment into MongoDB
        await reservation.save();

        // Send payment confirmation email
        try {
            await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: reservation.email,

                subject: "Purrsona Meow - Payment Confirmation & Receipt",

                text: `
Hello ${reservation.name},

Thank you for your payment!

Your reservation payment has been successfully recorded.

========== PAYMENT RECEIPT ==========

Booking Code: ${reservation.code}
Customer: ${reservation.name}
Session: ${reservation.session}
Date: ${reservation.date}
Time: ${reservation.time}
Room: ${reservation.zone || reservation.roomName}
Cat Handler: ${reservation.handler}

Payment Method: ${reservation.payment.method}
Payment Reference: ${reservation.payment.ref}
Amount Paid: $${reservation.payment.amount}
Payment Date: ${reservation.payment.paidAt}

Payment Status: PAID

=====================================

Thank you for choosing Purrsona Meow!
We look forward to welcoming you and your furry friends.

Purrsona Meow Team
                `,

                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 25px; color: #444;">
                        <h2 style="color: #bd8294;">Payment Successful!</h2>

                        <p>Hello ${reservation.name},</p>

                        <p>Thank you for your payment. Your reservation is now marked as paid.</p>

                        <div style="background: #faf5ef; padding: 20px; border-radius: 10px;">
                            <h3>Payment Receipt</h3>

                            <p><strong>Booking Code:</strong> ${reservation.code}</p>
                            <p><strong>Session:</strong> ${reservation.session}</p>
                            <p><strong>Date:</strong> ${reservation.date}</p>
                            <p><strong>Time:</strong> ${reservation.time}</p>
                            <p><strong>Room:</strong> ${reservation.zone || reservation.roomName}</p>
                            <p><strong>Cat Handler:</strong> ${reservation.handler}</p>

                            <hr>

                            <p><strong>Payment Method:</strong> ${reservation.payment.method}</p>
                            <p><strong>Payment Reference:</strong> ${reservation.payment.ref}</p>
                            <p><strong>Payment Date:</strong> ${reservation.payment.paidAt}</p>

                            <h2 style="color: #85a991;">Amount Paid: $${reservation.payment.amount}</h2>
                            <p><strong>Status:</strong> PAID</p>
                        </div>

                        <p>Thank you for choosing Purrsona Meow!</p>
                        <p>We look forward to welcoming you and your furry friends.</p>
                        <p><strong>Purrsona Meow Team</strong></p>
                    </div>
                `
            });

            console.log("Payment receipt email sent to:", reservation.email);

        } catch (emailError) {
            console.error("Payment saved, but receipt email failed:", emailError.message);
        }

        // Return successful payment response
        res.status(200).json({
            message: "Payment successful! Receipt email sent.",
            reservation: reservation
        });


    } catch (error) {
        console.error("Payment error:", error.message);

        res.status(500).json({
            message: "Failed to process payment."
        });
    }
});

// ==========================================
// START SERVER
// ==========================================

app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});
