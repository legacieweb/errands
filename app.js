const API_URL = 'https://errands-rcsm.onrender.com/api';

const ErantsApp = {
    getToken() {
        return localStorage.getItem('token');
    },
    getUser() {
        const user = localStorage.getItem('user');
        return user ? JSON.parse(user) : null;
    },
    async request(path, options = {}) {
        const token = this.getToken();
        const headers = {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` }),
            ...options.headers
        };
        const response = await fetch(`${API_URL}${path}`, { ...options, headers });
        const text = await response.text();
        let data = null;
        try {
            data = text ? JSON.parse(text) : null;
        } catch (e) {
            console.error('JSON parse error:', e);
        }
        
        if (!response.ok) {
            throw new Error((data && data.error) || 'Request failed');
        }
        return data;
    }
};

// Map Logic
let mapAdmin, markerAdmin, trackingMapAdmin, trackingRoutingAdmin, adminMarkerOnMap;
let map, routingControl;
function initMap() {
    const defaultLoc = [-1.286389, 36.817223]; // Nairobi
    
    // Picker Map
    const mapElement = document.getElementById('map-picker');
    if (mapElement) {
        if (!mapAdmin) {
            mapAdmin = L.map('map-picker').setView(defaultLoc, 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors'
            }).addTo(mapAdmin);

            mapAdmin.on('click', (e) => {
                const { lat, lng } = e.latlng;
                if (markerAdmin) markerAdmin.remove();
                markerAdmin = L.marker([lat, lng]).addTo(mapAdmin);
                
                document.getElementById('contact_lat').value = lat;
                document.getElementById('contact_lng').value = lng;
                
                document.getElementById('contact_address').value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
            });
        }
    }

    // Tracking Map
    const trackingElement = document.getElementById('admin-tracking-map');
    if (trackingElement) {
        if (!trackingMapAdmin) {
            trackingMapAdmin = L.map('admin-tracking-map').setView(defaultLoc, 12);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors'
            }).addTo(trackingMapAdmin);
        }
    }

    startAdminLocationTracking();
}

function startAdminLocationTracking() {
    if (!navigator.geolocation) {
        if (document.getElementById('admin-location-status')) {
            document.getElementById('admin-location-status').innerText = 'Not Supported';
        }
        return;
    }

    const adminIcon = L.icon({
        iconUrl: 'https://cdn-icons-png.flaticon.com/512/149/149060.png',
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32]
    });

    navigator.geolocation.watchPosition((pos) => {
        const { latitude, longitude } = pos.coords;
        const latlng = [latitude, longitude];

        if (document.getElementById('admin-location-status')) {
            document.getElementById('admin-location-status').innerText = 'OPERATIONAL';
            document.getElementById('admin-location-status').style.color = 'var(--success)';
        }
        if (document.getElementById('admin-coords')) {
            document.getElementById('admin-coords').innerText = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
        }

        if (trackingMapAdmin) {
            if (adminMarkerOnMap) {
                adminMarkerOnMap.setLatLng(latlng);
            } else {
                adminMarkerOnMap = L.marker(latlng, { icon: adminIcon })
                    .addTo(trackingMapAdmin)
                    .bindPopup('<b>You are here</b>')
                    .openPopup();
                trackingMapAdmin.setView(latlng, 14);
            }
        }
    }, (err) => {
        console.warn('Geolocation error:', err);
    }, {
        enableHighAccuracy: true,
        maximumAge: 30000,
        timeout: 27000
    });
}

function updateAdminTracking(destLat, destLng) {
    if (!trackingMapAdmin) return;
    if (trackingRoutingAdmin) trackingMapAdmin.removeControl(trackingRoutingAdmin);

    const riderIcon = L.icon({
        iconUrl: 'https://cdn-icons-png.flaticon.com/512/3195/3195884.png',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
    });

    const destIcon = L.icon({
        iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png',
        iconSize: [32, 32],
        iconAnchor: [16, 32]
    });

    navigator.geolocation.getCurrentPosition((pos) => {
        const start = [pos.coords.latitude, pos.coords.longitude];
        
        trackingRoutingAdmin = L.Routing.control({
            waypoints: [
                L.latLng(start),
                L.latLng(destLat, destLng)
            ],
            lineOptions: {
                styles: [{ color: '#4f46e5', weight: 4, opacity: 0.6 }]
            },
            createMarker: function(i, wp) {
                return L.marker(wp.latLng, {
                    icon: i === 0 ? riderIcon : destIcon
                });
            },
            addWaypoints: false,
            show: false
        }).addTo(trackingMapAdmin);

        const bounds = L.latLngBounds([start, [destLat, destLng]]);
        trackingMapAdmin.fitBounds(bounds, { padding: [50, 50] });
    });
}

// Global Auth Functions
window.logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    checkAuth();
};

window.togglePassword = (inputId) => {
    const input = document.getElementById(inputId);
    if (input) {
        input.type = input.type === 'password' ? 'text' : 'password';
    }
};

const checkAuth = () => {
    const user = ErantsApp.getUser();
    const adminDashboard = document.getElementById('admin-dashboard');
    const loginModal = document.getElementById('login-modal');
    const riderDashboard = document.getElementById('rider-dashboard');
    const authModal = document.getElementById('auth-modal');

    if (user) {
        if (user.role === 'admin' && adminDashboard) {
            if (loginModal) loginModal.style.display = 'none';
            adminDashboard.style.display = 'block';
            document.getElementById('admin-name').innerText = user.username;
            loadAdminErrands();
            loadContacts();
            loadRiders();
            initMap();
        } else if (user.role === 'rider' && riderDashboard) {
            if (authModal) authModal.style.display = 'none';
            riderDashboard.style.display = 'block';
            document.getElementById('rider-name').innerText = user.username;
            initRiderMap();
            loadRiderErrands();
        }
    } else {
        if (adminDashboard) adminDashboard.style.display = 'none';
        if (loginModal) loginModal.style.display = 'flex';
        if (riderDashboard) riderDashboard.style.display = 'none';
        if (authModal) authModal.style.display = 'flex';
    }
};

// Initialize app
document.addEventListener('DOMContentLoaded', checkAuth);

// Admin UI Logic
if (document.getElementById('admin-dashboard') || document.getElementById('rider-view')) {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('button');
            const originalText = btn.innerHTML;
            try {
                btn.disabled = true;
                btn.innerHTML = 'Logging in...';
                const res = await ErantsApp.request('/login', {
                    method: 'POST',
                    body: JSON.stringify({
                        username: document.getElementById('login-username').value,
                        password: document.getElementById('login-password').value
                    })
                });
                localStorage.setItem('token', res.token);
                localStorage.setItem('user', JSON.stringify(res.user));
                checkAuth();
            } catch (err) {
                alert(err.message);
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        });
    }

    const contactForm = document.getElementById('contact-form');
    if (contactForm) {
        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData);
            const id = document.getElementById('editing_contact_id').value;
            const btn = document.getElementById('contact-submit-btn');
            const originalText = btn.innerHTML;
            
            try {
                btn.disabled = true;
                btn.innerHTML = 'Saving...';
                
                if (id) {
                    await ErantsApp.request(`/contacts/${id}`, {
                        method: 'PUT',
                        body: JSON.stringify(data)
                    });
                    alert('Contact updated!');
                } else {
                    await ErantsApp.request('/contacts', {
                        method: 'POST',
                        body: JSON.stringify(data)
                    });
                    alert('Contact added!');
                }
                
                resetContactForm();
                loadContacts();
                hideClientRegistry();
            } catch (err) {
                alert(err.message);
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        });
    }

    const riderForm = document.getElementById('rider-form');
    if (riderForm) {
        riderForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('rider-submit-btn');
            const originalText = btn.innerHTML;
            const id = document.getElementById('editing_rider_id').value;
            
            try {
                btn.disabled = true;
                btn.innerHTML = id ? 'Updating...' : 'Registering...';
                
                const payload = {
                    username: document.getElementById('rider_username').value,
                    phone: document.getElementById('rider_phone').value
                };
                const password = document.getElementById('rider_password').value;
                if (password) payload.password = password;

                if (id) {
                    await ErantsApp.request(`/riders/${id}`, {
                        method: 'PUT',
                        body: JSON.stringify(payload)
                    });
                    alert('Rider updated successfully!');
                } else {
                    await ErantsApp.request('/riders', {
                        method: 'POST',
                        body: JSON.stringify(payload)
                    });
                    alert('Rider registered successfully!');
                }
                
                resetRiderForm();
                loadRiders();
            } catch (err) {
                alert(err.message);
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        });
    }
}

// Registry Functions
window.resetRiderForm = () => {
    const form = document.getElementById('rider-form');
    if (form) form.reset();
    document.getElementById('editing_rider_id').value = '';
    document.getElementById('rider_password').required = true;
    document.getElementById('rider_password').placeholder = "••••••••";
    document.getElementById('rider-submit-btn').innerText = 'Register Rider';
};

window.showRiderRegistry = () => {
    const modal = document.getElementById('rider-registry-modal');
    if (modal) {
        resetRiderForm();
        modal.style.display = 'flex';
        loadRiders();
    }
};

window.hideRiderRegistry = () => {
    const modal = document.getElementById('rider-registry-modal');
    if (modal) modal.style.display = 'none';
};

async function loadRiders() {
    try {
        const riders = await ErantsApp.request('/riders');
        const list = document.getElementById('riders-list');
        const statRiders = document.getElementById('stat-riders');
        
        if (statRiders) statRiders.innerText = riders.length;
        if (!list) return;

        list.innerHTML = riders.map(r => `
            <div class="contact-card" style="padding: 1rem; border-radius: var(--radius-md); background: rgba(255,255,255,0.03);">
                <div class="contact-info">
                    <h4 style="margin: 0; font-size: 0.95rem;">${r.username}</h4>
                    <p style="margin: 0.25rem 0; font-size: 0.8rem; color: var(--text-muted);">${r.phone}</p>
                </div>
                <div style="display: flex; gap: 0.5rem;">
                    <button onclick="editRider('${r.id}', '${r.username}', '${r.phone}')" class="btn btn-secondary btn-sm" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">Edit</button>
                    <button onclick="deleteRider('${r.id}')" class="btn btn-danger btn-sm" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">Remove</button>
                </div>
            </div>
        `).join('') || '<p style="text-align: center; color: var(--text-muted); padding: 1rem;">No active riders</p>';
    } catch (err) {
        console.error('Load riders error:', err);
    }
}

window.editRider = (id, username, phone) => {
    document.getElementById('editing_rider_id').value = id;
    document.getElementById('rider_username').value = username;
    document.getElementById('rider_phone').value = phone;
    document.getElementById('rider_password').required = false;
    document.getElementById('rider_password').placeholder = "Leave blank to keep current";
    document.getElementById('rider-submit-btn').innerText = 'Update Rider';
};

window.deleteRider = async (id) => {
    if (!confirm('Are you sure you want to remove this rider from the fleet?')) return;
    try {
        await ErantsApp.request(`/riders/${id}`, { method: 'DELETE' });
        loadRiders();
    } catch (err) {
        alert(err.message);
    }
};

window.showClientRegistry = () => {
    const modal = document.getElementById('client-registry-sidebar');
    if (modal) modal.style.display = 'flex';
};

window.hideClientRegistry = () => {
    const modal = document.getElementById('client-registry-sidebar');
    if (modal) modal.style.display = 'none';
};

window.resetContactForm = () => {
    const form = document.getElementById('contact-form');
    if (form) form.reset();
    const editingId = document.getElementById('editing_contact_id');
    if (editingId) editingId.value = '';
    if (markerAdmin) markerAdmin.remove();
};

async function loadContacts() {
    try {
        const contacts = await ErantsApp.request('/contacts');
        const list = document.getElementById('contacts-list');
        const statContacts = document.getElementById('stat-contacts');
        
        if (statContacts) statContacts.innerText = contacts.length;
        if (!list) return;

        list.innerHTML = contacts.map(c => `
            <div class="contact-card">
                <div class="contact-info">
                    <h3>${c.name}</h3>
                    <p>${c.phone}</p>
                    <p>${c.address}</p>
                </div>
                <div class="contact-actions">
                    <button onclick="editContact('${c.id}', '${c.name}', '${c.phone}', '${c.address}', ${c.lat}, ${c.lng})" class="btn btn-secondary btn-sm">Edit</button>
                    <button onclick="deleteContact('${c.id}')" class="btn btn-danger btn-sm">Delete</button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error('Load contacts error:', err);
    }
}

async function loadAdminErrands() {
    try {
        const errands = await ErantsApp.request('/errands');
        const list = document.getElementById('errand-list');
        const statTotal = document.getElementById('stat-total');
        const statCompleted = document.getElementById('stat-completed');
        const activeCount = document.getElementById('active-count');

        if (statTotal) statTotal.innerText = errands.length;
        if (statCompleted) statCompleted.innerText = errands.filter(e => e.status === 'completed').length;
        if (activeCount) activeCount.innerText = errands.filter(e => e.status === 'accepted').length;

        if (!list) return;

        list.innerHTML = errands.map(e => `
            <div class="errand-item">
                <div class="errand-info">
                    <strong>${e.client_name}</strong>
                    <p>${e.pickup_location} → ${e.delivery_location}</p>
                    <span class="badge ${e.status === 'completed' ? 'badge-success' : 'badge-primary'}">${e.status.toUpperCase()}</span>
                </div>
                <div class="errand-actions">
                    ${e.status !== 'completed' ? `<button onclick="updateAdminTracking(${e.delivery_lat}, ${e.delivery_lng})" class="btn btn-primary btn-sm">Track</button>` : ''}
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error('Load errands error:', err);
    }
}

window.editContact = (id, name, phone, address, lat, lng) => {
    document.getElementById('editing_contact_id').value = id;
    document.getElementById('contact_name').value = name;
    document.getElementById('contact_phone').value = phone;
    document.getElementById('contact_address').value = address;
    document.getElementById('contact_lat').value = lat;
    document.getElementById('contact_lng').value = lng;
    
    if (mapAdmin) {
        if (markerAdmin) markerAdmin.remove();
        markerAdmin = L.marker([lat, lng]).addTo(mapAdmin);
        mapAdmin.setView([lat, lng], 15);
    }
    
    showClientRegistry();
};

window.deleteContact = async (id) => {
    if (!confirm('Are you sure you want to delete this contact?')) return;
    try {
        await ErantsApp.request(`/contacts/${id}`, { method: 'DELETE' });
        loadContacts();
    } catch (err) {
        alert(err.message);
    }
};

window.useCurrentLocation = () => {
    if (!navigator.geolocation) return alert('Geolocation not supported');
    navigator.geolocation.getCurrentPosition((pos) => {
        const { latitude, longitude } = pos.coords;
        document.getElementById('contact_lat').value = latitude;
        document.getElementById('contact_lng').value = longitude;
        document.getElementById('contact_address').value = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
        
        if (mapAdmin) {
            if (markerAdmin) markerAdmin.remove();
            markerAdmin = L.marker([latitude, longitude]).addTo(mapAdmin);
            mapAdmin.setView([latitude, longitude], 15);
        }
    });
};

window.toggleManualLocation = () => {
    const picker = document.getElementById('manual-location-picker');
    picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
    if (picker.style.display === 'block' && mapAdmin) {
        setTimeout(() => mapAdmin.invalidateSize(), 100);
    }
};

// Rider Functions
function initRiderMap() {
    if (map) return;
    const defaultLoc = [-1.286389, 36.817223];
    map = L.map('map').setView(defaultLoc, 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
}

async function loadRiderErrands() {
    try {
        const errands = await ErantsApp.request('/errands');
        const display = document.getElementById('order-display');
        if (!display) return;

        if (errands.length === 0) {
            display.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-muted);">No assignments available.</div>';
            return;
        }

        display.innerHTML = errands.map(e => `
            <div class="errand-item">
                <div class="errand-info">
                    <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                        <span class="badge ${e.status === 'pending' ? 'badge-primary' : 'badge-success'}">${e.status.toUpperCase()}</span>
                        <span style="font-size: 0.75rem; color: var(--text-muted); font-family: monospace;">#${e.id}</span>
                    </div>
                    <h3 style="margin-bottom: 0.25rem;">${e.client_name}</h3>
                    <p style="font-size: 0.9rem; margin-bottom: 1rem;">${e.pickup_location} <span style="color: var(--primary);">→</span> ${e.delivery_location}</p>
                    
                    <div class="errand-actions">
                        ${e.status === 'pending' ? 
                            `<button onclick="acceptOrder(event, '${e.id}')" class="btn btn-primary btn-sm">Accept Mission</button>` : 
                            (e.status === 'accepted' ? 
                                `<div style="display: flex; gap: 0.5rem;">
                                    <button onclick="updateRoute(${e.delivery_lat}, ${e.delivery_lng})" class="btn btn-primary btn-sm">Navigate</button>
                                    <button onclick="completeOrder(event, '${e.id}')" class="btn btn-success btn-sm">Complete</button>
                                </div>` : 
                                '<span style="color: var(--success); font-weight: 600;">MISSION ACCOMPLISHED</span>'
                            )
                        }
                    </div>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error('Load rider errands error:', err);
    }
}

window.acceptOrder = async (e, id) => {
    const btn = e.target;
    const originalText = btn.innerHTML;
    try {
        btn.disabled = true;
        btn.innerHTML = 'Accepting...';
        await ErantsApp.request(`/errands/${id}/accept`, { method: 'PUT' });
        loadRiderErrands();
        const notice = document.getElementById('map-notice');
        if (notice) notice.style.display = 'none';
    } catch (err) {
        alert(err.message);
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
};

window.completeOrder = async (e, id) => {
    const btn = e.target;
    const originalText = btn.innerHTML;
    try {
        btn.disabled = true;
        btn.innerHTML = 'Completing...';
        await ErantsApp.request(`/errands/${id}/complete`, { method: 'PUT' });
        if (routingControl) map.removeControl(routingControl);
        loadRiderErrands();
        alert('Mission completed!');
        const notice = document.getElementById('map-notice');
        if (notice) {
            notice.style.display = 'block';
            notice.querySelector('p').innerText = 'Mission accomplished. Awaiting next assignment.';
        }
    } catch (err) {
        alert(err.message);
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
};

window.updateRoute = (lat, lng) => {
    if (!map) return;
    if (routingControl) map.removeControl(routingControl);
    
    const riderIcon = L.icon({
        iconUrl: 'https://cdn-icons-png.flaticon.com/512/3195/3195884.png',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
    });

    const destIcon = L.icon({
        iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png',
        iconSize: [32, 32],
        iconAnchor: [16, 32]
    });

    navigator.geolocation.getCurrentPosition((pos) => {
        const start = [pos.coords.latitude, pos.coords.longitude];
        const end = [lat, lng];
        
        routingControl = L.Routing.control({
            waypoints: [
                L.latLng(start),
                L.latLng(end)
            ],
            lineOptions: {
                styles: [{ color: '#6366f1', weight: 6, opacity: 0.7 }]
            },
            createMarker: function(i, wp) {
                return L.marker(wp.latLng, {
                    icon: i === 0 ? riderIcon : destIcon,
                    draggable: false
                });
            },
            addWaypoints: false,
            show: false,
            routeWhileDragging: false
        }).addTo(map);

        const bounds = L.latLngBounds([start, end]);
        map.fitBounds(bounds, { padding: [50, 50] });
        
        const notice = document.getElementById('map-notice');
        if (notice) notice.style.display = 'none';
    }, (err) => {
        console.error('Geolocation error:', err);
        map.setView([lat, lng], 13);
        L.marker([lat, lng], { icon: destIcon }).addTo(map);
    });
};

setInterval(() => {
    const user = ErantsApp.getUser();
    if (user) {
        if (user.role === 'admin') loadAdminErrands();
        else if (user.role === 'rider') loadRiderErrands();
    }
}, 10000);
