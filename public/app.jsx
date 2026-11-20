
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid
} from "recharts";

import { useState, useEffect } from "react";
import "./App.css";

const COLORS = ["#E8A87C", "#85B09A", "#C38D9E"];

// GET RESERVATION TIME
function getReservationTime(reservation) {
  return (
    reservation.time ||
    reservation.startTime ||
    reservation.sessionTime ||
    "—"
  );
}

// GET RESERVATION ZONE
function getReservationZone(reservation) {
  return (
    reservation.zoneCode ||
    reservation.zone ||
    reservation.assignedZone ||
    "—"
  );
}

// GET RESERVATION HANDLER
function getReservationHandler(reservation) {
  const handler =
    reservation.handlerName ||
    reservation.handler ||
    reservation.assignedHandler;

  if (handler && typeof handler === "object") {
    return handler.name || "—";
  }

  return handler || "—";
}

function App() {
  const [expandedChart, setExpandedChart] = useState(null);
  const [reservations, setReservations] = useState([]);

  const [currentPage, setCurrentPage] = useState(0);
  const [schedulePage, setSchedulePage] = useState(0);

  const itemsPerPage = 10;
  const schedulePerPage = 5;

  const [selectedMonth, setSelectedMonth] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);

  const [filterStatus, setFilterStatus] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // FETCH RESERVATIONS
  useEffect(() => {
    async function fetchReservations() {
      try {
        const response = await fetch(
          "http://localhost:3000/reservations"
        );

        if (!response.ok) {
          throw new Error("Failed to retrieve reservations.");
        }

        const result = await response.json();
        setReservations(result.reservations || []);
      } catch (error) {
        console.error("Dashboard error:", error);
        setError(error.message);
      } finally {
        setLoading(false);
      }
    }

    fetchReservations();
  }, []);

  if (loading) {
    return <p>Loading reservations...</p>;
  }

  if (error) {
    return <p>Error: {error}</p>;
  }

  // RESERVATION COUNTS
  const assignedCount = reservations.filter(
    reservation =>
      reservation.status?.toLowerCase() === "assigned"
  ).length;

  const concludedCount = reservations.filter(
    reservation =>
      reservation.status?.toLowerCase() === "concluded"
  ).length;

  const cancelledCount = reservations.filter(
    reservation =>
      reservation.status?.toLowerCase() === "cancelled"
  ).length;

  const totalBookings = reservations.length;

  // RESERVATION STATUS CHART
  const bookingData = [
    { name: "Assigned", value: assignedCount },
    { name: "Concluded", value: concludedCount },
    { name: "Cancelled", value: cancelledCount }
  ];

  // CURRENT YEAR
  const currentYear = new Date().getFullYear();

  // MONTHLY BOOKINGS
  const monthlyData = Array.from(
    { length: 12 },
    (_, index) => {
      const monthNumber = index + 1;

      const count = reservations.filter(reservation => {
        if (!reservation.date) return false;

        const [year, month] = reservation.date
          .split("-")
          .map(Number);

        return (
          year === currentYear &&
          month === monthNumber
        );
      }).length;

      return {
        month: new Date(
          currentYear,
          index,
          1
        ).toLocaleString("en-US", {
          month: "short"
        }),
        monthNumber,
        bookings: count
      };
    }
  );

  // DAILY BOOKINGS
  const dailyData = selectedMonth
    ? Array.from(
        {
          length: new Date(
            currentYear,
            selectedMonth,
            0
          ).getDate()
        },
        (_, index) => {
          const dayNumber = index + 1;

          const count = reservations.filter(reservation => {
            if (!reservation.date) return false;

            const [year, month, day] =
              reservation.date.split("-").map(Number);

            return (
              year === currentYear &&
              month === selectedMonth &&
              day === dayNumber
            );
          }).length;

          return {
            day: String(dayNumber),
            bookings: count
          };
        }
      )
    : [];

  // SELECTED MONTH NAME
  const selectedMonthName = selectedMonth
    ? new Date(
        currentYear,
        selectedMonth - 1,
        1
      ).toLocaleString("en-US", {
        month: "long"
      })
    : "";

  // INDIVIDUAL RESERVATIONS FOR SELECTED DAY
  const selectedDayReservations = selectedDay
    ? reservations.filter(reservation => {
        if (!reservation.date) return false;

        const [year, month, day] =
          reservation.date.split("-").map(Number);

        return (
          year === currentYear &&
          month === selectedMonth &&
          day === selectedDay
        );
      })
    : [];

  // RECENT RESERVATIONS
  const recentReservations = [...reservations].sort(
    (a, b) =>
      new Date(b.createdAt) - new Date(a.createdAt)
  );

  // FILTER BY PIE CHART SELECTION
  const filteredReservations = filterStatus
    ? recentReservations.filter(
        reservation =>
          reservation.status?.toLowerCase() ===
          filterStatus.toLowerCase()
      )
    : recentReservations;

  // PIE CHART CLICK
  const handleStatusClick = entry => {
    const clickedStatus =
      entry?.name || entry?.payload?.name;

    if (!clickedStatus) return;

    setFilterStatus(current =>
      current === clickedStatus ? null : clickedStatus
    );

    setCurrentPage(0);
  };

  // RECENT RESERVATIONS PAGINATION
  const totalPages = Math.ceil(
    filteredReservations.length / itemsPerPage
  );

  const startIndex = currentPage * itemsPerPage;

  const displayedReservations =
    filteredReservations.slice(
      startIndex,
      startIndex + itemsPerPage
    );

  // UPCOMING SCHEDULE
  const now = new Date();

  const todayString = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");

  const upcomingReservations = reservations
    .filter(reservation => {
      const status = reservation.status?.toLowerCase();

      return (
        reservation.date &&
        reservation.date >= todayString &&
        status !== "cancelled"
      );
    })
    .sort((a, b) => {
      const dateComparison =
        a.date.localeCompare(b.date);

      if (dateComparison !== 0) {
        return dateComparison;
      }

      return String(getReservationTime(a)).localeCompare(
        String(getReservationTime(b))
      );
    });

  // UPCOMING SCHEDULE PAGINATION
  const scheduleTotalPages = Math.ceil(
    upcomingReservations.length / schedulePerPage
  );

  const scheduleStartIndex =
    schedulePage * schedulePerPage;

  const displayedUpcomingReservations =
    upcomingReservations.slice(
      scheduleStartIndex,
      scheduleStartIndex + schedulePerPage
    );

  // MONTHLY / DAILY CHART CLICK
  const handleBookingChartClick = (data, expanded) => {
    const point = data?.payload || data;

    if (selectedMonth) {
      // Only select a day inside the expanded popup
      if (expanded && point?.day !== undefined) {
        setSelectedDay(Number(point.day));
      }
    } else {
      // Select a month
      if (point?.monthNumber !== undefined) {
        setSelectedMonth(Number(point.monthNumber));
        setSelectedDay(null);
      }
    }
  };

  // SHARED BAR CHART
  const renderBookingChart = (expanded = false) => (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={selectedMonth ? dailyData : monthlyData}
        margin={
          expanded
            ? {
                top: 20,
                right: 30,
                left: 10,
                bottom: 20
              }
            : {
                top: 10,
                right: 8,
                left: -15,
                bottom: 0
              }
        }
        barCategoryGap="18%"
      >
        <CartesianGrid strokeDasharray="3 3" />

        <XAxis
          dataKey={selectedMonth ? "day" : "month"}
          tick={{ fontSize: expanded ? 13 : 11 }}
          interval={0}
          angle={
            selectedMonth ? 0 : expanded ? 0 : -25
          }
          textAnchor={
            selectedMonth ? "middle" : expanded ? "middle" : "end"
          }
          height={selectedMonth || expanded ? 30 : 45}
        />

        <YAxis allowDecimals={false} />

        <Tooltip />

        <Bar
          dataKey="bookings"
          fill="#8B5E3C"
          name="Bookings"
          radius={[5, 5, 0, 0]}
          style={{ cursor: "pointer" }}
          onClick={data =>
            handleBookingChartClick(data, expanded)
          }
        />
      </BarChart>
    </ResponsiveContainer>
  );

  return (
    <div className="dashboard">

      {/* HEADER */}
      <header className="dashboard-header">
        <div>
          <h1>Cat Café Dashboard</h1>
          <p>Welcome to your reservation overview!</p>
        </div>

        <button
          className="back-button"
          onClick={() => {
            window.location.href =
              "http://127.0.0.1:5500/index.html";
          }}
        >
          ← Back to Website
        </button>
      </header>

      {/* SUMMARY CARDS */}
      <section className="summary-cards">

        <div className="summary-card">
          <h3>Total Bookings</h3>
          <h2>{totalBookings}</h2>
        </div>

        <div className="summary-card assigned">
          <h3>Assigned</h3>
          <h2>{assignedCount}</h2>
        </div>

        <div className="summary-card concluded">
          <h3>Concluded</h3>
          <h2>{concludedCount}</h2>
        </div>

        <div className="summary-card cancelled">
          <h3>Cancelled</h3>
          <h2>{cancelledCount}</h2>
        </div>

      </section>

      {/* CHARTS ROW */}
      <div className="charts-grid">

        {/* RESERVATION STATUS PIE CHART */}
        <section className="chart-section">

          <div className="chart-heading">
            <h2>Reservation Status</h2>

            <button
              className="expand-button"
              onClick={() => setExpandedChart("pie")}
            >
              ⛶ Expand
            </button>
          </div>

          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={bookingData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius="70%"
                  label
                  onClick={handleStatusClick}
                  style={{ cursor: "pointer" }}
                >
                  {bookingData.map((entry, index) => (
                    <Cell
                      key={entry.name}
                      fill={COLORS[index]}
                    />
                  ))}
                </Pie>

                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

        </section>

        {/* MONTHLY BOOKINGS CHART */}
        <section className="chart-section">

          <div className="chart-heading">
            <h2>
              {selectedMonth
                ? `${selectedMonthName} ${currentYear} - Daily Bookings`
                : "Monthly Bookings"}
            </h2>

            <div>
              {selectedMonth && (
                <button
                  className="expand-button"
                  onClick={() => {
                    setSelectedMonth(null);
                    setSelectedDay(null);
                  }}
                >
                  ← All Months
                </button>
              )}

              <button
                className="expand-button"
                onClick={() => setExpandedChart("bar")}
              >
                ⛶ Expand
              </button>
            </div>
          </div>

          <p className="chart-hint">
            {selectedMonth
              ? "Expand the chart to view individual reservations for a day."
              : "Click a month to view daily bookings."}
          </p>

          <div className="chart-container">
            {renderBookingChart()}
          </div>

        </section>

      </div>

      {/* EXPANDED CHART POPUP */}
      {expandedChart && (
        <div
          className="chart-overlay"
          onClick={() => setExpandedChart(null)}
        >
          <div
            className="expanded-chart"
            onClick={e => e.stopPropagation()}
          >

            <div className="chart-heading">
              <h2>
                {expandedChart === "pie"
                  ? "Reservation Status"
                  : selectedMonth
                    ? `${selectedMonthName} ${currentYear} - Daily Bookings`
                    : "Monthly Bookings"}
              </h2>

              <button
                className="close-button"
                onClick={() => setExpandedChart(null)}
              >
                Close ✕
              </button>
            </div>

            {/* EXPANDED PIE CHART */}
            {expandedChart === "pie" ? (
              <ResponsiveContainer width="100%" height="90%">
                <PieChart>
                  <Pie
                    data={bookingData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius="70%"
                    label
                    onClick={handleStatusClick}
                    style={{ cursor: "pointer" }}
                  >
                    {bookingData.map((entry, index) => (
                      <Cell
                        key={entry.name}
                        fill={COLORS[index]}
                      />
                    ))}
                  </Pie>

                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (

              /* EXPANDED MONTHLY / DAILY BOOKINGS */
              <div className="expanded-booking-content">

                {selectedMonth && (
                  <button
                    className="expand-button"
                    onClick={() => {
                      setSelectedMonth(null);
                      setSelectedDay(null);
                    }}
                  >
                    ← All Months
                  </button>
                )}

                <div className="expanded-booking-chart">
                  {renderBookingChart(true)}
                </div>

                {/* INDIVIDUAL DAILY RESERVATIONS */}
                {selectedDay && (
                  <div className="expanded-daily-details">

                    <div className="table-heading">
                      <h3>
                        Reservations on {selectedDay}{" "}
                        {selectedMonthName} {currentYear}
                      </h3>

                      <button
                        className="expand-button"
                        onClick={() => setSelectedDay(null)}
                      >
                        ← Back to Daily Chart
                      </button>
                    </div>

                    <div className="table-container">
                      <table>
                        <thead>
                          <tr>
                            <th>Booking ID</th>
                            <th>Customer</th>
                            <th>Session</th>
                            <th>Time</th>
                            <th>Zone</th>
                            <th>Handler</th>
                            <th>Status</th>
                          </tr>
                        </thead>

                        <tbody>
                          {selectedDayReservations.map(reservation => (
                            <tr key={reservation._id || reservation.code}>
                              <td>{reservation.code}</td>
                              <td>{reservation.name}</td>
                              <td>{reservation.session}</td>
                              <td>{getReservationTime(reservation)}</td>
                              <td>{getReservationZone(reservation)}</td>
                              <td>{getReservationHandler(reservation)}</td>
                              <td>{reservation.status}</td>
                            </tr>
                          ))}

                          {selectedDayReservations.length === 0 && (
                            <tr>
                              <td colSpan="7">
                                No reservations found for this day.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                  </div>
                )}

              </div>
            )}

          </div>
        </div>
      )}

      {/* BOTTOM TABLES */}
      <div className="bottom-grid">

      {/* RECENT RESERVATIONS */}
      <section className="table-section">

        <div className="table-heading">
          <div>
            <h2>Recent Reservations</h2>

            {filterStatus && (
              <p>
                Showing {filterStatus} reservations

                <button
                  className="expand-button"
                  onClick={() => {
                    setFilterStatus(null);
                    setCurrentPage(0);
                  }}
                >
                  Clear Filter ✕
                </button>
              </p>
            )}
          </div>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Booking ID</th>
                <th>Customer</th>
                <th>Session</th>
                <th>Date</th>
                <th>Time</th>
                <th>Zone</th>
                <th>Handler</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {displayedReservations.map(reservation => (
                <tr key={reservation._id || reservation.code}>
                  <td>{reservation.code}</td>
                  <td>{reservation.name}</td>
                  <td>{reservation.session}</td>
                  <td>{reservation.date || "—"}</td>
                  <td>{getReservationTime(reservation)}</td>
                  <td>{getReservationZone(reservation)}</td>
                  <td>{getReservationHandler(reservation)}</td>
                  <td>
                    <span
                      className={`status ${reservation.status?.toLowerCase()}`}
                    >
                      {reservation.status}
                    </span>
                  </td>
                </tr>
              ))}

              {filteredReservations.length === 0 && (
                <tr>
                  <td colSpan="8">
                    No reservations found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* RECENT RESERVATIONS PAGINATION */}
        {filteredReservations.length > 0 && (
          <div className="pagination">

            <span className="pagination-info">
              Showing {startIndex + 1}–
              {Math.min(
                startIndex + itemsPerPage,
                filteredReservations.length
              )}
              {" "}of {filteredReservations.length} reservations
            </span>

            <div className="pagination-buttons">
              <button
                className="pagination-btn"
                onClick={() =>
                  setCurrentPage(
                    Math.max(currentPage - 1, 0)
                  )
                }
                disabled={currentPage === 0}
                aria-label="Previous page"
              >
                ←
              </button>

              <button
                className="pagination-btn"
                onClick={() =>
                  setCurrentPage(
                    Math.min(
                      currentPage + 1,
                      totalPages - 1
                    )
                  )
                }
                disabled={currentPage >= totalPages - 1}
                aria-label="Next page"
              >
                →
              </button>
            </div>

          </div>
        )}

      </section>

      {/* UPCOMING SCHEDULE */}
      <section className="table-section schedule-section">

        <div className="table-heading">
          <h2>Upcoming Schedule</h2>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Booking ID</th>
                <th>Customer</th>
                <th>Session</th>
                <th>Date</th>
                <th>Time</th>
                <th>Zone</th>
                <th>Handler</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {displayedUpcomingReservations.map(reservation => (
                <tr key={reservation._id || reservation.code}>
                  <td>{reservation.code}</td>
                  <td>{reservation.name}</td>
                  <td>{reservation.session}</td>
                  <td>{reservation.date}</td>
                  <td>{getReservationTime(reservation)}</td>
                  <td>{getReservationZone(reservation)}</td>
                  <td>{getReservationHandler(reservation)}</td>
                  <td>
                    <span
                      className={`status ${reservation.status?.toLowerCase()}`}
                    >
                      {reservation.status}
                    </span>
                  </td>
                </tr>
              ))}

              {upcomingReservations.length === 0 && (
                <tr>
                  <td colSpan="8">
                    No upcoming reservations.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* UPCOMING SCHEDULE PAGINATION */}
        {upcomingReservations.length > 0 && (
          <div className="pagination">

            <span className="pagination-info">
              Showing {scheduleStartIndex + 1}–
              {Math.min(
                scheduleStartIndex + schedulePerPage,
                upcomingReservations.length
              )}
              {" "}of {upcomingReservations.length} reservations
            </span>

            <div className="pagination-buttons">
              <button
                className="pagination-btn"
                onClick={() =>
                  setSchedulePage(
                    Math.max(schedulePage - 1, 0)
                  )
                }
                disabled={schedulePage === 0}
                aria-label="Previous page"
              >
                ←
              </button>

              <button
                className="pagination-btn"
                onClick={() =>
                  setSchedulePage(
                    Math.min(
                      schedulePage + 1,
                      scheduleTotalPages - 1
                    )
                  )
                }
                disabled={
                  schedulePage >= scheduleTotalPages - 1
                }
                aria-label="Next page"
              >
                →
              </button>
            </div>

          </div>
        )}

            </section>

</div>

    </div>
  );
}

export default App;
