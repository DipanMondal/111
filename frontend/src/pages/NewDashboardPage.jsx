import React, { useEffect, useState, useRef } from 'react';
import Chart from 'chart.js/auto';
// FIX: Corrected the import path to be a standard relative path without the extension.
import { getSystemStatus, getChartData, getComparisonDetails, getDamageCounts, getComparisonDates, getAllComparisons } from '../api/apiService';
import { toast } from 'react-toastify';
import { Box, MenuItem, Select, FormControl, InputLabel, IconButton, Tooltip } from '@mui/material';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import { format, parse, isWithinInterval, subWeeks, subMonths, subYears, isSameDay, parseISO } from 'date-fns';

// Define BASE_PREFIX for S3 path construction
const BASE_PREFIX = '2024_Oct_CR_WagonDamageDetection/Wagon_H';

// --- Sub-component for Left/Right View ---
const renderDetailTable = (detailData) => (
    <table className="table table-sm table-borderless" style={{'--bs-table-bg': 'transparent'}}>
        <thead className="table-light">
            <tr><th>Old</th><th>New</th><th>Resolved</th><th>Image</th></tr>
        </thead>
        <tbody>
            {detailData && detailData.length > 0 ? (
                detailData.map((detail, index) => (
                    <tr key={index}>
                        <td>{detail.old}</td><td>{detail.new}</td><td>{detail.resolved}</td>
                        <td>
                            {detail.image ? (
                                <a href={detail.image} target="_blank" rel="noopener noreferrer"><img src={detail.image} alt="damage" style={{ width: '150px', borderRadius: '4px' }} /></a>
                            ) : <span className="text-muted">No Image</span>}
                        </td>
                    </tr>
                ))
            ) : (
                <tr><td colSpan="4" className="text-muted text-center py-3">No details found.</td></tr>
            )}
        </tbody>
    </table>
);

// --- Sub-component specifically for Top View, matching the new design ---
const renderTopViewDetailTable = (detailData) => (
    <table className="table table-sm table-borderless" style={{'--bs-table-bg': 'transparent'}}>
        <thead className="table-light">
            <tr><th>Damage Type</th><th>Count</th><th>Image</th></tr>
        </thead>
        <tbody>
            {detailData && detailData.length > 0 ? (
                detailData.map((detail, index) => (
                    <tr key={index}>
                        {detail.status ? (
                            <td colSpan="3" className="text-muted text-center">
                                {detail.status}
                                {detail.image && <a href={detail.image} target="_blank" rel="noopener noreferrer" className="ms-2"><i className="fas fa-image"></i></a>}
                            </td>
                        ) : (
                            <>
                                <td>{detail.type}</td>
                                <td>{detail.count}</td>
                                <td>
                                    {detail.image ? (
                                        <a href={detail.image} target="_blank" rel="noopener noreferrer"><img src={detail.image} alt={detail.type} style={{ width: '150px', borderRadius: '4px' }} /></a>
                                    ) : <span className="text-muted">No Image</span>}
                                </td>
                            </>
                        )}
                    </tr>
                ))
            ) : (
                <tr><td colSpan="3" className="text-muted text-center py-3">No details available.</td></tr>
            )}
        </tbody>
    </table>
);

// Helper to count class labels in a damage list
const renderLabelCounts = (damageList, title) => {
    if (!damageList || damageList.length === 0) return (
        <div style={{marginBottom: '1rem', color: '#222'}}><h6 style={{color:'#1a202c', fontWeight:600}}>{title}</h6><div className="text-muted">No data</div></div>
    );
    // Count occurrences of each label
    const counts = {};
    damageList.forEach(d => {
        if (d.label) counts[d.label] = (counts[d.label] || 0) + 1;
    });
    return (
        <div style={{marginBottom: '1rem', color: '#222'}}>
            <h6 style={{color:'#1a202c', fontWeight:600}}>{title}</h6>
            <ul style={{margin:0, paddingLeft: '1.2em', color:'#222', fontWeight:500}}>
                {Object.entries(counts).map(([label, count]) => (
                    <li key={label} style={{color:'#222'}}><strong>{label}</strong>: {count}</li>
                ))}
            </ul>
        </div>
    );
};

// Helper to render a table of class counts for left/right
const renderClassCountTable = (data) => {
    // Gather all unique class labels from OLD, NEW, RESOLVED
    const allLabels = new Set();
    ['OLD', 'NEW', 'RESOLVED'].forEach(status => {
        (data?.[status] || []).forEach(d => {
            if (d.label) allLabels.add(d.label);
        });
    });
    const labels = Array.from(allLabels).sort();
    // Helper to count per status
    const getCount = (status, label) => (data?.[status] || []).filter(d => d.label === label).length;
    return (
        <table className="table table-sm table-bordered" style={{marginBottom: '1rem'}}>
            <thead>
                <tr>
                    <th>Status</th>
                    {labels.map(label => <th key={label}>{label}</th>)}
                </tr>
            </thead>
            <tbody>
                {['OLD', 'NEW', 'RESOLVED'].map(status => (
                    <tr key={status}>
                        <td>{status}</td>
                        {labels.map(label => <td key={label}>{getCount(status, label)}</td>)}
                    </tr>
                ))}
            </tbody>
        </table>
    );
};

// --- Modal for Comparison Table Details ---
const ComparisonDetailModal = ({ isOpen, onClose, data, details, isLoading }) => {
    const [showWagonDetails, setShowWagonDetails] = useState(false);

    useEffect(() => {
        setShowWagonDetails(false);
    }, [data]);

    if (!isOpen) return null;

    return (
        <>
            <div className="modal-backdrop fade show"></div>
            <div className="modal fade show" style={{ display: 'block' }} role="dialog">
                <div className="modal-dialog modal-xl modal-dialog-centered">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h5 className="modal-title">Comparison Details for {data?.id}</h5>
                            <button type="button" className="btn-close" onClick={onClose}></button>
                        </div>
                        <div className="modal-body">
                            <table className="table mb-4">
                                <thead><tr><th>Train ID</th><th>Wagons</th><th>Left View Variations</th><th>Right View Variations</th><th>Top View Variations</th><th>Actions</th></tr></thead>
                                <tbody>
                                    <tr>
                                        <td>{data?.id}</td><td>{data?.wagons}</td><td>{data?.left_damages}</td>
                                        <td>{data?.right_damages}</td><td>{data?.top_damages}</td>
                                        <td>
                                            <button className="action-btn primary" onClick={() => setShowWagonDetails(!showWagonDetails)} disabled={isLoading}>
                                                {isLoading ? <span className="spinner-border spinner-border-sm"></span> : (showWagonDetails ? 'Hide Details' : 'View Details')}
                                            </button>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>

                            {showWagonDetails && (
                                <div className="mt-4">
                                    <h6 className="mb-3">Wagon Frame Details</h6>
                                    {isLoading ? (
                                        <div className="text-center py-5"><div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading...</span></div></div>
                                    ) : (
                                        <div className="table-responsive" style={{maxHeight: '50vh'}}>
                                            <table className="table table-bordered table-hover">
                                                <thead className="table-light"><tr><th className="align-middle text-center" style={{width: '100px'}}>Wagon #</th><th className="text-center">Left View</th><th className="text-center">Right View</th><th className="text-center">Top View</th></tr></thead>
                                                <tbody>
                                                    {details && details.length > 0 ? details.map(wagon => (
                                                        <tr key={wagon.wagon_id}>
                                                            <td className="text-center align-middle"><strong>{wagon.wagon_id}</strong></td>
                                                            <td className="p-0">{renderDetailTable(wagon.left_view_details)}</td>
                                                            <td className="p-0">{renderDetailTable(wagon.right_view_details)}</td>
                                                            <td className="p-0">{renderTopViewDetailTable(wagon.top_view_details)}</td>
                                                        </tr>
                                                    )) : <tr><td colSpan="4" className="text-muted text-center py-4">No wagon details available.</td></tr>}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="modal-footer"><button type="button" className="action-btn outline" onClick={onClose}>Close</button></div>
                    </div>
                </div>
            </div>
        </>
    );
};

// --- Modal for a single view (Left/Right/Top) ---
const ComparisonViewModal = ({ isOpen, onClose, entry, view }) => {
    if (!isOpen || !entry || !view) return null;
    const wagons = entry.results[view] || [];
    return (
        <>
            <div className="modal-backdrop fade show"></div>
            <div className="modal fade show modal-animate-in" style={{ display: 'block' }} role="dialog">
                <div className="modal-dialog modal-xl modal-dialog-centered">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h5 className="modal-title">{view.charAt(0).toUpperCase() + view.slice(1)} Comparison Result ({entry.date})</h5>
                            <button type="button" className="btn-close" onClick={onClose}></button>
                        </div>
                        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto', color: '#222' }}>
                            {wagons.length === 0 ? (
                                <div className="text-muted">No data found for this view.</div>
                            ) : wagons.map((data, idx) => (
                                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'stretch', marginBottom: '2rem', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, background: '#f8fafc', color: '#222' }}>
                                    {/* Wagon Image on top */}
                                    <div style={{ width: '100%', textAlign: 'center', marginBottom: '1rem' }}>
                                        {view === 'top' ? (
                                            <div><strong>Top Image:</strong><br />
                                                {data?.image_url ? <img src={data.image_url} alt="Top" style={{maxWidth:'100%',maxHeight:260, borderRadius:8, boxShadow:'0 4px 24px rgba(0,0,0,0.12)'}} /> : <span className="text-muted">No image</span>}
                                            </div>
                                        ) : (
                                            <div><strong>Wagon Image:</strong><br />
                                                {data?.image_url ? <img src={data.image_url} alt="Wagon" style={{maxWidth:'100%',maxHeight:260, borderRadius:8, boxShadow:'0 4px 24px rgba(0,0,0,0.12)'}} /> : <span className="text-muted">No image</span>}
                                            </div>
                                        )}
                                    </div>
                                    {/* Table below image */}
                                    <div style={{ width: '100%' }}>
                                        <h6 style={{marginBottom: '1rem', color:'#1a202c', fontWeight:700}}>Wagon: {data.wagon_id || idx+1}</h6>
                                        {view === 'top' ? (
                                            <table className="table table-sm table-bordered">
                                                <thead><tr><th>Cracks</th><th>Gravel</th><th>Hole</th></tr></thead>
                                                <tbody><tr>
                                                    <td>{data?.cracks ?? '-'}</td>
                                                    <td>{data?.gravel ?? '-'}</td>
                                                    <td>{data?.hole ?? '-'}</td>
                                                </tr></tbody>
                                            </table>
                                        ) : (
                                            <>
                                                {renderClassCountTable(data)}
                                                <div className="mb-2" style={{color:'#1a202c', fontWeight:600}}><strong>Generated On:</strong> {data?.generated_on || '-'}</div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="modal-footer"><button type="button" className="action-btn outline" onClick={onClose}>Close</button></div>
                    </div>
                </div>
            </div>
        </>
    );
};

// Helper to normalize date to YYYY-MM-DD
const normalizeDate = (dateStr) => {
    // Try parsing as YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    // Try parsing as DD-MM-YYYY
    if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
        const [d, m, y] = dateStr.split('-');
        return `${y}-${m}-${d}`;
    }
    // Fallback: try parseISO
    try {
        return format(parseISO(dateStr), 'yyyy-MM-dd');
    } catch {
        return dateStr;
    }
};

// --- The Main Dashboard Page Component ---
const NewDashboardPage = () => {
    const [selectedComparisonTrain, setSelectedComparisonTrain] = useState(null);
    const [isComparisonModalOpen, setComparisonModalOpen] = useState(false);
    const [comparisonDetails, setComparisonDetails] = useState(null);
    const [isComparisonLoading, setIsComparisonLoading] = useState(false);
    const [stats, setStats] = useState(null);
    const [chartsData, setChartsData] = useState(null);
    const [comparisonData, setComparisonData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    // New state to track which view is selected for each entry
    const [selectedView, setSelectedView] = useState({}); // { [trainId]: 'left' | 'right' | 'top' }
    const [comparisonEntries, setComparisonEntries] = useState([]);
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedEntry, setSelectedEntry] = useState(null);
    const [availableDates, setAvailableDates] = useState([]); // For calendar
    const [selectedDate, setSelectedDate] = useState(null);
    const [filterRange, setFilterRange] = useState('all');
    const pieChartRef = useRef(null);
    
    const handleOpenComparisonModal = async (trainData) => {
        setSelectedComparisonTrain(trainData);
        setComparisonModalOpen(true);
        setIsComparisonLoading(true);
        setComparisonDetails(null);

        try {
            const response = await getComparisonDetails(trainData.s3_path);
            if(response.success){
                setComparisonDetails(response.details);
            } else {
                toast.error(response.error || "Failed to fetch comparison details.");
            }
        } catch (error) {
            console.error("Error fetching comparison details:", error);
            toast.error("An error occurred while fetching details.");
        } finally {
            setIsComparisonLoading(false);
        }
    };
    
    const handleCloseComparisonModal = () => {
        setComparisonModalOpen(false);
        setSelectedComparisonTrain(null);
        setComparisonDetails(null);
    };

    useEffect(() => {
        let isMounted = true;
        const abortControllers = [];

        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const statusRes = await getSystemStatus();
                if (statusRes.error) console.error("Error fetching system status:", statusRes.error); else setStats(statusRes);
                
                const chartRes = await getChartData();
                if (chartRes.error) console.error("Error fetching chart data:", chartRes.error); else setChartsData(chartRes);

                // Fetch dynamic date list from backend
                const datesRes = await getComparisonDates();
                if (!datesRes.success) {
                    toast.error(datesRes.error || "Failed to fetch available dates.");
                    setComparisonData([]);
                    setAvailableDates([]);
                    setLoading(false);
                    return;
                }
                // Normalize all available dates
                setAvailableDates(datesRes.dates.map(normalizeDate));
                const rows = datesRes.dates.map((date, idx) => {
                    const normDate = normalizeDate(date);
                    const [y, m, d] = normDate.split('-');
                    const s3Date = `${d}-${m}-${y}`;
                    return {
                        id: `TR-COMP-${(idx+1).toString().padStart(3, '0')}`,
                        date: normDate,
                        left_damages: 'Loading...',
                        right_damages: 'Loading...',
                        top_damages: 'Loading...',
                        s3_path: `${BASE_PREFIX}/${s3Date}/admin1/Comparision_Results`
                    };
                });

                // Fetch damage counts for each row, with abort support
                const updatedData = await Promise.all(rows.map(async (train) => {
                    const controller = new AbortController();
                    abortControllers.push(controller);
                    try {
                        const countsRes = await getDamageCounts(train.s3_path, { signal: controller.signal });
                        if (countsRes.success) {
                            return {
                                ...train,
                                left_damages: countsRes.counts.left_view_damages,
                                right_damages: countsRes.counts.right_view_damages,
                                top_damages: countsRes.counts.top_view_damages,
                            };
                        }
                        return { ...train, left_damages: 'Error', right_damages: 'Error', top_damages: 'Error' };
                    } catch (err) {
                        if (err.name === 'AbortError') return null;
                        return { ...train, left_damages: 'Error', right_damages: 'Error', top_damages: 'Error' };
                    }
                }));

                if (isMounted) {
                    setComparisonData(updatedData.filter(Boolean));
                    setLoading(false);
                }
            } catch (err) {
                if (isMounted) {
                    setError("Failed to load data.");
                    setLoading(false);
                }
            }
        };

        fetchData();

        return () => {
            isMounted = false;
            abortControllers.forEach(controller => controller.abort());
        };
    }, []);

    useEffect(() => {
        if (!chartsData) return;
        const chartInstances = [];
        const createChart = (ctx, config) => {
            if (ctx) {
                const chart = new Chart(ctx, { ...config, options: { ...config.options, responsive: true, maintainAspectRatio: false, animation: true } });
                chartInstances.push(chart);
            }
        };
        const damageCtx = document.getElementById('damageTypesChart');
        if (chartsData.damage_types) createChart(damageCtx, { type: 'doughnut', data: { labels: chartsData.damage_types.labels, datasets: [{ data: chartsData.damage_types.data, backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'], borderWidth: 0 }] }, options: { plugins: { legend: { display: false } } } });
        // Use ref for pie chart
        if (pieChartRef.current && chartsData.damage_types) {
            createChart(pieChartRef.current, { type: 'pie', data: { labels: chartsData.damage_types.labels, datasets: [{ data: chartsData.damage_types.data, backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'], borderWidth: 0 }] }, options: { plugins: { legend: { display: true } } } });
        }
        const severityCtx = document.getElementById('severityTrendsChart');
        if (chartsData.damage_types) createChart(severityCtx, { type: 'bar', data: { labels: chartsData.damage_types.labels, datasets: [{ label: 'Damage Count', data: chartsData.damage_types.data, backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#dc2626'] }] }, options: { plugins: { legend: { display: false } } } });
        return () => chartInstances.forEach(chart => chart.destroy());
    }, [chartsData]);

    useEffect(() => {
        setLoading(true);
        getAllComparisons().then(res => {
            if (res.success) {
                // Normalize all entry dates
                setComparisonEntries(res.comparisons.map(entry => ({ ...entry, date: normalizeDate(entry.date) })));
                setError(null);
            } else {
                setError(res.error || 'Failed to fetch data.');
            }
            setLoading(false);
        }).catch(err => {
            setError('Failed to fetch data.');
            setLoading(false);
        });
    }, []);

    console.log('comparisonData', comparisonData);

    // Filtering logic for table
    const getFilteredEntries = () => {
        let filtered = comparisonEntries;
        if (selectedDate) {
            filtered = filtered.filter(entry => isSameDay(parse(entry.date, 'yyyy-MM-dd', new Date()), selectedDate));
        }
        const now = new Date();
        switch (filterRange) {
            case 'recent':
                filtered = filtered.slice(-1); // Most recent
                break;
            case 'week':
                filtered = filtered.filter(entry => isWithinInterval(parse(entry.date, 'yyyy-MM-dd', new Date()), { start: subWeeks(now, 1), end: now }));
                break;
            case 'month':
                filtered = filtered.filter(entry => isWithinInterval(parse(entry.date, 'yyyy-MM-dd', new Date()), { start: subMonths(now, 1), end: now }));
                break;
            case '3months':
                filtered = filtered.filter(entry => isWithinInterval(parse(entry.date, 'yyyy-MM-dd', new Date()), { start: subMonths(now, 3), end: now }));
                break;
            case '6months':
                filtered = filtered.filter(entry => isWithinInterval(parse(entry.date, 'yyyy-MM-dd', new Date()), { start: subMonths(now, 6), end: now }));
                break;
            case 'year':
                filtered = filtered.filter(entry => isWithinInterval(parse(entry.date, 'yyyy-MM-dd', new Date()), { start: subYears(now, 1), end: now }));
                break;
            default:
                break;
        }
        return filtered;
    };

    const totalTrains = comparisonEntries.length;
    const totalLeft = comparisonEntries.reduce((sum, entry) => Array.isArray(entry.results?.left) ? sum + entry.results.left.length : sum, 0);
    const totalRight = comparisonEntries.reduce((sum, entry) => Array.isArray(entry.results?.right) ? sum + entry.results.right.length : sum, 0);
    const totalTop = comparisonEntries.reduce((sum, entry) => Array.isArray(entry.results?.top) ? sum + entry.results.top.length : sum, 0);
    const totalVariations = totalLeft + totalRight + totalTop;

    return (
        <>
            <div className="fade-in">
                <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2rem', marginBottom: 32 }}>
                    <div className="kpi-card" style={{ minWidth: 0, width: '100%' }}><div className="kpi-header"><span className="kpi-title">Total Trains</span><div className="kpi-icon primary"><i className="fas fa-train"></i></div></div><div className="kpi-value">{totalTrains}</div><div className="kpi-change positive"><i className="fas fa-arrow-up"></i><span>All time</span></div></div>
                    <div className="kpi-card" style={{ minWidth: 0, width: '100%' }}><div className="kpi-header"><span className="kpi-title">Variations Observed</span><div className="kpi-icon warning"><i className="fas fa-exclamation-triangle"></i></div></div><div className="kpi-value">{totalVariations}</div><div style={{ fontSize: '0.95em', color: '#666', fontWeight: 500, marginTop: 4 }}>
                        Left: {totalLeft} &nbsp;|&nbsp; Right: {totalRight} &nbsp;|&nbsp; Top: {totalTop}
                    </div></div>
                    <div className="kpi-card" style={{ minWidth: 0, width: '100%' }}><div className="kpi-header"><span className="kpi-title">Processing Rate</span><div className="kpi-icon primary"><i className="fas fa-tachometer-alt"></i></div></div><div className="kpi-value">{stats?.processing_speed ?? '...'}</div><div className="kpi-change positive"><i className="fas fa-arrow-up"></i><span>Efficiency</span></div></div>
                </div>

                <div className="charts-section" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: 32 }}>
                    <div className="chart-card"><div className="chart-header"><h3 className="chart-title">Damage Types Distribution</h3></div><div className="chart-container"><canvas id="damageTypesChart"></canvas>
                        <div style={{marginTop: 24}}><h4 style={{fontSize:'1.1em',marginBottom:8}}>Pie Chart</h4><canvas ref={pieChartRef} width={320} height={180} style={{display:'block',margin:'0 auto'}}></canvas></div>
                    </div></div>
                    <div className="chart-card"><div className="chart-header"><h3 className="chart-title">Damage Severity Trends</h3></div><div className="chart-container"><canvas id="severityTrendsChart"></canvas></div></div>
                </div>

                <div className="data-section mt-4">
                    <div className="section-header" style={{display:'flex',alignItems:'center',gap:16}}>
                        <h2 className="section-title">Comparison Entries</h2>
                        <LocalizationProvider dateAdapter={AdapterDateFns}>
                            <DatePicker
                                label="Select Date"
                                value={selectedDate}
                                onChange={date => setSelectedDate(date)}
                                renderInput={({ inputRef, inputProps, InputProps }) => (
                                    <Box sx={{ display: 'flex', alignItems: 'center', ml: 2 }}>
                                        <input ref={inputRef} {...inputProps} style={{ display: 'none' }} />
                                        <Tooltip title="Calendar">
                                            <IconButton>{InputProps?.endAdornment || <CalendarMonthIcon />}</IconButton>
                                        </Tooltip>
                                    </Box>
                                )}
                                shouldDisableDate={date => {
                                    // Only enable availableDates (all normalized)
                                    return !availableDates.some(d => isSameDay(parse(d, 'yyyy-MM-dd', new Date()), date));
                                }}
                                disableFuture
                                clearable
                            />
                        </LocalizationProvider>
                        <FormControl size="small" sx={{ minWidth: 160, ml: 2 }}>
                            <InputLabel>Filter</InputLabel>
                            <Select
                                value={filterRange}
                                label="Filter"
                                onChange={e => setFilterRange(e.target.value)}
                            >
                                <MenuItem value="all">All</MenuItem>
                                <MenuItem value="recent">Most Recent</MenuItem>
                                <MenuItem value="week">Last Week</MenuItem>
                                <MenuItem value="month">Last Month</MenuItem>
                                <MenuItem value="3months">Past 3 Months</MenuItem>
                                <MenuItem value="6months">Past 6 Months</MenuItem>
                                <MenuItem value="year">Past Year</MenuItem>
                            </Select>
                        </FormControl>
                        <button className="action-btn outline" style={{marginLeft:8}} onClick={() => { setSelectedDate(null); setFilterRange('all'); }}>Reset</button>
                    </div>
                    <div className="table-responsive">
                        <table className="data-table">
                            <thead>
                                <tr><th>Date</th><th>User</th><th>Actions</th></tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={3} className="text-center text-muted">Loading...</td></tr>
                                ) : error ? (
                                    <tr><td colSpan={3} className="text-center text-danger">{error}</td></tr>
                                ) : getFilteredEntries().length === 0 ? (
                                    <tr><td colSpan={3} className="text-center text-muted">No data found.</td></tr>
                                ) : (
                                    getFilteredEntries().map((entry, idx) => (
                                        <tr key={idx}>
                                            <td>{entry.date}</td>
                                            <td>{entry.user}</td>
                                            <td>
                                                {['left','right','top'].map(view => (
                                                    <button
                                                        key={view}
                                                        className="action-btn primary me-2"
                                                        onClick={() => { setSelectedEntry(entry); setSelectedView(view); setModalOpen(true); }}
                                                        disabled={!entry.results[view]}
                                                    >
                                                        {view.charAt(0).toUpperCase() + view.slice(1)}
                                                    </button>
                                                ))}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <ComparisonDetailModal 
                isOpen={isComparisonModalOpen} 
                onClose={handleCloseComparisonModal} 
                data={selectedComparisonTrain}
                details={comparisonDetails}
                isLoading={isComparisonLoading}
            />
            <ComparisonViewModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                entry={selectedEntry}
                view={selectedView}
            />
        </>
    );
};

export default NewDashboardPage;
