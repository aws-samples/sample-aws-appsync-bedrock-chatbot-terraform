/**
 * Authentication service for handling JWT-based authentication
 */
import config from '../config';

class AuthService {
  /**
   * Login with username and password
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {Promise<Object>} - Authentication data including token
   */
  async login(username, password) {
    try {
      const response = await fetch(`${config.apiUrl}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Login failed');
      }
      
      const data = await response.json();
      
      // Store auth data in localStorage
      localStorage.setItem('token', data.token);
      localStorage.setItem('username', data.username);
      localStorage.setItem('roles', JSON.stringify(data.roles || []));
      localStorage.setItem('tokenExpiry', Date.now() + (data.expiresIn * 1000));
      
      return data;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }
  
  /**
   * Logout the current user
   */
  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('roles');
    localStorage.removeItem('tokenExpiry');
  }
  
  /**
   * Get the current JWT token
   * @returns {string|null} - JWT token or null if not logged in or token expired
   */
  getToken() {
    const expiry = localStorage.getItem('tokenExpiry');
    if (expiry && parseInt(expiry) < Date.now()) {
      // Token expired, clear it
      this.logout();
      return null;
    }
    return localStorage.getItem('token');
  }
  
  /**
   * Check if the user is logged in
   * @returns {boolean} - True if logged in, false otherwise
   */
  isLoggedIn() {
    return !!this.getToken();
  }
  
  /**
   * Get the current username
   * @returns {string|null} - Username or null if not logged in
   */
  getUsername() {
    return localStorage.getItem('username');
  }
  
  /**
   * Get the user roles
   * @returns {Array<string>} - Array of roles
   */
  getRoles() {
    const roles = localStorage.getItem('roles');
    return roles ? JSON.parse(roles) : [];
  }
  
  /**
   * Get the token expiry timestamp
   * @returns {number|null} - Token expiry timestamp or null if not set
   */
  getTokenExpiry() {
    const expiry = localStorage.getItem('tokenExpiry');
    return expiry ? parseInt(expiry) : null;
  }
  
  /**
   * Check if the user has a specific role
   * @param {string} role - Role to check
   * @returns {boolean} - True if the user has the role, false otherwise
   */
  hasRole(role) {
    const roles = this.getRoles();
    return roles.includes(role);
  }
}

export default new AuthService();
