import React from 'react';
import Layout from '../../components/Layout';

// Firm pages share the main workspace shell; Layout switches navigation for firm members.
export default function FirmLayout({ children }) {
  return <Layout>{children}</Layout>;
}
