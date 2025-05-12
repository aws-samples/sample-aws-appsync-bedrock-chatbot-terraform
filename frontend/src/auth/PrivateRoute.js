import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import authService from './authService';

/**
 * PrivateRoute component to protect routes that require authentication
 * Uses React Router v6 Outlet pattern
 */
function PrivateRoute() {
  const isAuthenticated = authService.isLoggedIn();
  
  // If authenticated, render the child routes (Outlet)
  // Otherwise, redirect to the login page
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
}

export default PrivateRoute;
