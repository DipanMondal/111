import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom'; // Import useNavigate
import { startFrameExtraction, cancelFrameExtra } from '../api/apiService.js';

const FrameExtraction = () => {
    const [clientId, setClientId] = useState('');
    const [retrieveDate, setRetrieveDate] = useState('');
    const [cameraAngle, setCameraAngle] = useState('left');
	const [direction, setDirection] = useState('entry');
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState('');
    const [error, setError] = useState('');
    const [taskId, setTaskId] = useState(null);
    const navigate = useNavigate(); // Initialize useNavigate

    useEffect(() => {
        // Set today's date as default
        const today = new Date().toISOString().split('T')[0];
        setRetrieveDate(today);
    }, []);

    const taskCancel = async () => {
        try {
            const res = await cancelFrameExtra(taskId);
            setStatus('');
            setError('');
            if (res?.message) {
                setStatus(res.message);
            } else {
                setError(res?.error);
            }
            setTaskId(null);
        } catch (err) {
            console.error(err);
            setError('Error while starting comparison. Please check server logs.');
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (taskId) {
            setStatus("Already One task is queued. Please Wait for it to finish.");
            return;
        }
        setIsLoading(true);
        setStatus('');
        setError('');

        const payload = {
            date: retrieveDate,
            name: clientId,
            view: cameraAngle,
			direction: direction
        };
		

        try {
            const res = await startFrameExtraction(payload);
            setTaskId(res.task_id);
            if (res?.message) {
                setStatus(res.message);
            } else {
                setError(res?.error || 'Unknown response from server');
            }
        } catch (err) {
            console.error(err);
            setError('Error while starting comparison. Please check server logs.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="data-section fade-in">
            <div className="section-header">
                <h2 className="section-title">Extract Frames</h2>
            </div>
            <div className="p-4">
                <form onSubmit={handleSubmit}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'flex-end' }}>
                        <div style={{ flex: '1 1 150px' }}>
                            <label htmlFor="clientId" className="form-label fw-bold small">Client ID</label>
                            <input type="text" className="search-input w-100" id="clientId" value={clientId} onChange={e => setClientId(e.target.value)} required />
                        </div>
                        <div style={{ flex: '1 1 150px' }}>
                            <label htmlFor="retrieveDate" className="form-label fw-bold small">Date</label>
                            <input type="date" className="search-input w-100" id="retrieveDate" value={retrieveDate} onChange={e => setRetrieveDate(e.target.value)} required />
                        </div>
                        <div style={{ flex: '0 1 200px' }}>
                            <label className="form-label fw-bold small">Camera Angle</label>
                            <div className="d-flex gap-3 pt-2">
                                {['left', 'right', 'top'].map(view => (
                                    <div className="form-check" key={view}>
                                        <input className="form-check-input" type="radio" name="camera_angle" id={`camera_${view}`} value={view} checked={cameraAngle === view} onChange={e => setCameraAngle(e.target.value)} />
                                        <label className="form-check-label" htmlFor={`camera_${view}`}>{view.charAt(0).toUpperCase() + view.slice(1)}</label>
                                    </div>
                                ))}
                            </div>
                        </div>
						
						<div style={{ flex: '0 1 200px' }}>
							<label className="form-label fw-bold small">Direction</label>
							<div className="d-flex gap-3 pt-2">
								{['entry', 'exit'].map(dir => (
									<div className="form-check" key={dir}>
										<input
											className="form-check-input"
											type="radio"
											name="direction"
											id={`direction_${dir}`}
											value={dir}
											checked={direction === dir}
											onChange={e => setDirection(e.target.value)}
										/>
										<label className="form-check-label" htmlFor={`direction_${dir}`}>
											{dir.charAt(0).toUpperCase() + dir.slice(1)}
										</label>
									</div>
								))}
							</div>
						</div>
						
                        <div style={{ flex: '1 1 auto' }}>
                            <button type="submit" className="action-btn primary w-100" disabled={isLoading}>
                                {isLoading ? <><span className="spinner-border spinner-border-sm me-2"></span>Processing...</> : <><i className="fas fa-play me-2"></i>Start Process</>}
                            </button>
                        </div>
                    </div>
                </form>
                {taskId && (
                    <div className="mt-3">
                        <button onClick={() => taskCancel()} className="btn btn-danger">
                            Cancel Process
                        </button>
                    </div>
                )}

                {status && <div className="alert alert-success mt-4">{status}</div>}
                {error && <div className="alert alert-danger mt-4">{error}</div>}
            </div>
        </div>
    );
};

export default FrameExtraction;