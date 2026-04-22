const UTF8_BOM = '﻿';

function escapeCell(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const str = value instanceof Date ? value.toISOString() : String(value);

  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

function toCsv(rows, columns) {
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new Error('toCsv requires a non-empty columns array');
  }

  const headerLine = columns.map((column) => escapeCell(column.header)).join(',');

  const bodyLines = (rows || []).map((row) =>
    columns
      .map((column) => {
        const value = typeof column.value === 'function' ? column.value(row) : row[column.key];
        return escapeCell(value);
      })
      .join(',')
  );

  return UTF8_BOM + [headerLine, ...bodyLines].join('\r\n') + '\r\n';
}

module.exports = { toCsv, UTF8_BOM };
